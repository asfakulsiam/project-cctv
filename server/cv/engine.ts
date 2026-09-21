/**
 * Smart Classroom Exam Monitoring System
 * Multi-Camera Computer Vision & Behavioral Analysis Orchestration Engine
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. ZERO FAKE PEOPLE:
 *    Empty cameras produce ZERO detections, ZERO tracks, and ZERO global persons.
 *    No artificial human synthesis from seat rectangles.
 * 2. Independent Camera Pipelines:
 *    Each camera runs an independent CameraTracker (CAM1 -> tracker1, CAM2 -> tracker2).
 *    Background processing is continuous across all online cameras; UI focus does NOT gate processing.
 * 3. FrameSource Abstraction:
 *    Every camera owns its own FrameSource stream.
 * 4. Resilient Camera Failure Behavior:
 *    When a camera disconnects, its tracks transition ACTIVE -> LOST -> TERMINATED.
 *    No false detections are produced during camera outages.
 * 5. Explainable Real-Time Telemetry:
 *    - detected_persons: Unique global persons
 *    - active_tracks: Sum of active camera tracks across all cameras
 *    - processing_fps: Measured real-time processing FPS
 *    - Cross-camera event deduplication
 */

import { WebSocket, WebSocketServer } from 'ws';
import { 
  AppSettings, 
  BehaviorEvent, 
  CameraConfig, 
  CameraTrack, 
  GlobalPerson,
  RealtimeStateMessage, 
  SeatRecord, 
  StudentRecord, 
  SystemStats 
} from '../../src/types.js';
import { db } from '../db.js';
import { BehaviorAnalyzer } from './behavior.js';
import { RealPersonDetector } from './personDetector.js';
import { CameraTracker } from './tracker.js';
import { UnifiedStudentManager } from './unified_model.js';

export interface FrameSource {
  open(): Promise<void>;
  readFrame(): Promise<any | null>;
  close(): Promise<void>;
  getStatus(): {
    connected: boolean;
    fps: number;
    error?: string;
  };
}

export class StandardFrameSource implements FrameSource {
  private camera: CameraConfig;
  private isConnected = false;

  constructor(camera: CameraConfig) {
    this.camera = camera;
  }

  public async open(): Promise<void> {
    this.isConnected = this.camera.status === 'online' && this.camera.enabled !== false;
  }

  public async readFrame(): Promise<any | null> {
    if (!this.isConnected || this.camera.status !== 'online') return null;
    return { timestamp: Date.now(), cameraId: this.camera.camera_id };
  }

  public async close(): Promise<void> {
    this.isConnected = false;
  }

  public getStatus(): { connected: boolean; fps: number; error?: string } {
    return {
      connected: this.isConnected,
      fps: (this.camera as any).fps || 15,
      error: this.camera.status === 'offline' ? 'Camera offline' : undefined
    };
  }
}

export { CVEngine as MultiCameraCVEngine };

export class CVEngine {
  private isRunning = false;
  private loopTimer: NodeJS.Timeout | null = null;
  private settings: AppSettings;
  private cameras: Map<string, CameraConfig> = new Map();
  private cameraSources: Map<string, FrameSource> = new Map();
  private seats: SeatRecord[] = [];
  
  // Vision Components
  private personDetector: RealPersonDetector;
  private trackers: Map<string, CameraTracker> = new Map();
  private unifiedStudentManager: UnifiedStudentManager;
  private behaviorAnalyzer: BehaviorAnalyzer;

  // Injected Detections Queue (real video detections or integration streams)
  private cameraDetectionsQueue: Map<string, any[]> = new Map();
  private cameraPhonesQueue: Map<string, any[]> = new Map();

  // WebSockets & Telemetry
  private wss: WebSocketServer | null = null;
  private wsClients: Set<WebSocket> = new Set();
  private latestTracksByCamera: Map<string, CameraTrack[]> = new Map();
  private latestUnifiedStudents: StudentRecord[] = [];
  private latestGlobalPersons: GlobalPerson[] = [];
  private cachedStats: SystemStats;

  // Measured FPS tracking
  private frameCount = 0;
  private lastFpsCalcTime = Date.now();
  private currentMeasuredFps = 0;

  constructor(
    settings: AppSettings,
    initialCameras: CameraConfig[],
    initialStudents: StudentRecord[],
    initialSeats: SeatRecord[]
  ) {
    this.settings = settings;
    this.seats = initialSeats;

    this.personDetector = new RealPersonDetector(
      settings.thresholds.min_person_confidence ?? 0.50
    );

    this.unifiedStudentManager = new UnifiedStudentManager(
      initialStudents,
      initialSeats,
      {
        warning_suspicion_threshold: settings.thresholds.warning_suspicion_threshold,
        high_suspicion_threshold: settings.thresholds.high_suspicion_threshold,
        reid_similarity_threshold: 0.70
      }
    );

    this.behaviorAnalyzer = new BehaviorAnalyzer(
      'session-active',
      settings.thresholds,
      settings.suspicion_weights
    );

    this.cachedStats = {
      total_cameras: initialCameras.length,
      online_cameras: initialCameras.filter(c => c.status === 'online').length,
      detected_persons: 0,
      active_tracks: 0,
      unique_global_persons: 0,
      present_students: 0,
      students_moving: 0,
      warning_count: 0,
      high_suspicion_count: 0,
      active_alerts: 0,
      processing_fps: 0,
      system_health: 'optimal'
    };

    this.syncCameras(initialCameras);
  }

  public syncCameras(cameras: CameraConfig[]): void {
    const currentCameraIds = new Set(cameras.map(c => c.camera_id));

    // Initialize or update camera trackers & sources
    for (const camera of cameras) {
      this.cameras.set(camera.camera_id, camera);
      
      if (!this.trackers.has(camera.camera_id)) {
        this.trackers.set(
          camera.camera_id, 
          new CameraTracker(camera.camera_id, this.settings.thresholds)
        );
      } else {
        this.trackers.get(camera.camera_id)!.setThresholds(this.settings.thresholds);
      }

      if (!this.cameraSources.has(camera.camera_id)) {
        const source = new StandardFrameSource(camera);
        source.open();
        this.cameraSources.set(camera.camera_id, source);
      }
    }

    // Prune removed cameras
    for (const staleId of this.cameras.keys()) {
      if (!currentCameraIds.has(staleId)) {
        this.cameras.delete(staleId);
        this.trackers.delete(staleId);
        this.cameraSources.delete(staleId);
        this.cameraDetectionsQueue.delete(staleId);
        this.cameraPhonesQueue.delete(staleId);
      }
    }
  }

  public injectCameraDetections(cameraId: string, detections: any[], phones: any[] = []): void {
    this.cameraDetectionsQueue.set(cameraId, detections);
    if (phones.length > 0) {
      this.cameraPhonesQueue.set(cameraId, phones);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[CV Engine] Multi-camera processing engine started at target', this.settings.processing_fps, 'FPS');
    this.scheduleNextTick();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    console.log('[CV Engine] Multi-camera processing engine stopped.');
  }

  private scheduleNextTick(): void {
    if (!this.isRunning) return;
    const intervalMs = Math.round(1000 / (this.settings.processing_fps || 15));
    this.loopTimer = setTimeout(async () => {
      try {
        await this.processFrameTick();
      } catch (err) {
        console.error('[CV Engine] Error during processing tick:', err);
      }
      this.scheduleNextTick();
    }, intervalMs);
  }

  /**
   * Core processing tick executed across all active cameras.
   */
  private async processFrameTick(): Promise<void> {
    const now = Date.now();
    const cameraTracksMap = new Map<string, CameraTrack[]>();
    const newEvents: BehaviorEvent[] = [];
    const allActiveTrackIds = new Set<string>();

    // Measure FPS
    this.frameCount++;
    const elapsedFpsTime = (now - this.lastFpsCalcTime) / 1000;
    if (elapsedFpsTime >= 1.0) {
      this.currentMeasuredFps = Math.round((this.frameCount / elapsedFpsTime) * 10) / 10;
      this.frameCount = 0;
      this.lastFpsCalcTime = now;
    }

    const registeredStudents = this.unifiedStudentManager.getStudents();

    // Run independent per-camera detection & tracking
    for (const [cameraId, camera] of this.cameras.entries()) {
      const tracker = this.trackers.get(cameraId);
      if (!tracker) continue;

      // Handle offline or disabled camera
      if (camera.status !== 'online' || camera.enabled === false) {
        const remainingLostTracks = tracker.handleNoFrame(now);
        cameraTracksMap.set(cameraId, remainingLostTracks);
        continue;
      }

      // Real Detection Gatekeeper:
      // Ingest real detections from queue (if injected) or process frame.
      // ZERO fake people: If queue has no detections and no frame, confirmedHumans is empty!
      let confirmedHumans: any[] = [];
      if (this.cameraDetectionsQueue.has(cameraId)) {
        const rawDetections = this.cameraDetectionsQueue.get(cameraId) || [];
        const rawPhones = this.cameraPhonesQueue.get(cameraId) || [];
        this.cameraDetectionsQueue.delete(cameraId);
        this.cameraPhonesQueue.delete(cameraId);
        confirmedHumans = this.personDetector.processDetections(rawDetections, rawPhones);
      }

      // Update independent per-camera tracker
      const tracks = tracker.updateDetections(confirmedHumans, now);

      // Evaluate temporal behavior and scoring for each real track
      for (const track of tracks) {
        allActiveTrackIds.add(track.track_id);
        const studentInfo = registeredStudents.find(s => s.id === track.associated_student_id);
        const seat = this.seats.find(s => s.id === track.seat_id);
        const seatRegion = seat?.camera_regions[cameraId];

        const { events, suspicion_score, current_score, cumulative_score, max_score } = this.behaviorAnalyzer.analyzeTrack(
          track,
          studentInfo ? { name: studentInfo.name, student_id_number: studentInfo.student_id_number } : undefined,
          seatRegion,
          now
        );

        track.suspicion_score = suspicion_score;
        track.current_score = current_score;
        track.cumulative_score = cumulative_score;
        track.max_score = max_score;
        tracker.setTrackSuspicion(track.track_id, cumulative_score, current_score, max_score);

        // Cross-camera event deduplication
        for (const evt of events) {
          if (track.global_person_id) {
            evt.global_person_id = track.global_person_id;
          }
          const shouldEmit = track.global_person_id
            ? this.unifiedStudentManager.shouldEmitCrossCameraEvent(track.global_person_id, evt.event_type, now)
            : true;

          if (shouldEmit) {
            newEvents.push(evt);
            await db.recordEvent(evt);
          }
        }
      }

      cameraTracksMap.set(cameraId, tracks);
    }

    this.behaviorAnalyzer.pruneStaleContexts(allActiveTrackIds);

    // UNIFIED STUDENT MODEL (cross-camera association & Layer 3 Global Person Registry)
    const cameraList = Array.from(this.cameras.values());
    const { students: unifiedStudents, globalPersons } = this.unifiedStudentManager.syncCrossCameraObservations(
      cameraTracksMap,
      cameraList,
      now
    );

    // Calculate Real-Time Stats
    const stats = this.computeRealtimeStats(cameraTracksMap, unifiedStudents, globalPersons);

    this.latestTracksByCamera = cameraTracksMap;
    this.latestUnifiedStudents = unifiedStudents;
    this.latestGlobalPersons = globalPersons;

    // Broadcast Real-Time State over WebSockets
    this.broadcastTelemetry({
      type: 'TELEMETRY_UPDATE',
      timestamp: now,
      tracks_by_camera: Object.fromEntries(cameraTracksMap.entries()),
      students: unifiedStudents,
      global_persons: globalPersons,
      stats,
      new_event: newEvents.length > 0 ? newEvents[newEvents.length - 1] : undefined
    });
  }

  public async clearTrackWarning(trackId: string): Promise<boolean> {
    for (const tracker of this.trackers.values()) {
      tracker.clearTrackWarning(trackId);
    }
    this.behaviorAnalyzer.clearTrackWarning(trackId);
    return true;
  }

  public async clearStudentWarning(studentId: string): Promise<boolean> {
    this.unifiedStudentManager.clearStudentWarning(studentId);
    for (const tracker of this.trackers.values()) {
      for (const trackId of tracker.getActiveTrackIds()) {
        const track = tracker.getTrack(trackId);
        if (track && track.associated_student_id === studentId) {
          tracker.clearTrackWarning(trackId);
          this.behaviorAnalyzer.clearTrackWarning(trackId);
        }
      }
    }
    return true;
  }

  public async toggleCameraStatus(cameraId: string): Promise<CameraConfig | null> {
    const cam = this.cameras.get(cameraId);
    if (!cam) return null;

    const newStatus = cam.status === 'online' ? 'offline' : 'online';
    cam.status = newStatus;
    await db.updateCamera(cameraId, { status: newStatus });

    const now = Date.now();
    const eventType = newStatus === 'online' ? 'CAMERA_RECONNECTED' : 'CAMERA_OFFLINE';
    const evt: BehaviorEvent = {
      id: `evt-cam-${now}`,
      session_id: 'session-active',
      event_type: eventType,
      camera_id: cameraId,
      timestamp: now,
      confidence: 1.0,
      score_contribution: newStatus === 'offline' ? 10 : 0,
      severity: newStatus === 'offline' ? 'warning' : 'info',
      description: `${cam.name} is now ${newStatus.toUpperCase()}`
    };

    await db.recordEvent(evt);
    this.broadcastTelemetry({
      type: 'EVENT',
      timestamp: now,
      new_event: evt,
      cameras: Array.from(this.cameras.values())
    });

    return cam;
  }

  private computeRealtimeStats(
    tracksByCamera: Map<string, CameraTrack[]>,
    students: StudentRecord[],
    globalPersons: GlobalPerson[]
  ): SystemStats {
    let totalOnline = 0;
    for (const cam of this.cameras.values()) {
      if (cam.status === 'online' && cam.enabled !== false) totalOnline++;
    }

    const presentStudentsCount = students.filter(s => s.status === 'present' || s.status === 'flagged').length;
    
    let totalActiveTracks = 0;
    let movingCount = 0;
    for (const tracks of tracksByCamera.values()) {
      totalActiveTracks += tracks.length;
      for (const t of tracks) {
        if (t.is_moving) movingCount++;
      }
    }

    const highSuspicionCount = students.filter(s => s.unified_suspicion_score >= this.settings.thresholds.high_suspicion_threshold).length;
    const warningCount = students.filter(s => 
      s.unified_suspicion_score >= this.settings.thresholds.warning_suspicion_threshold && 
      s.unified_suspicion_score < this.settings.thresholds.high_suspicion_threshold
    ).length;

    const totalCameras = this.cameras.size;
    const uniqueGlobalPersonsCount = globalPersons.length;

    const stats: SystemStats = {
      total_cameras: totalCameras,
      online_cameras: totalOnline,
      detected_persons: uniqueGlobalPersonsCount,
      active_tracks: totalActiveTracks,
      unique_global_persons: uniqueGlobalPersonsCount,
      present_students: presentStudentsCount,
      students_moving: Math.min(presentStudentsCount, movingCount),
      warning_count: warningCount,
      high_suspicion_count: highSuspicionCount,
      active_alerts: warningCount + highSuspicionCount,
      processing_fps: totalOnline > 0 ? this.currentMeasuredFps : 0,
      system_health: totalCameras === 0 ? 'offline' : (totalOnline === totalCameras ? 'optimal' : (totalOnline > 0 ? 'warning' : 'offline'))
    };

    this.cachedStats = stats;
    return stats;
  }

  private async sendInitialSync(ws: WebSocket): Promise<void> {
    const cameras = Array.from(this.cameras.values());
    const students = this.unifiedStudentManager.getStudents();
    const recentEvents = await db.getEvents(20);

    const payload: RealtimeStateMessage = {
      type: 'INITIAL_SYNC',
      timestamp: Date.now(),
      cameras,
      students,
      global_persons: this.latestGlobalPersons,
      events: recentEvents,
      stats: this.cachedStats
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  private broadcastTelemetry(message: RealtimeStateMessage): void {
    if (this.wsClients.size === 0) return;
    const data = JSON.stringify(message);
    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  public setupWebSocketServer(wss: WebSocketServer): void {
    this.wss = wss;
    wss.on('connection', (ws: WebSocket) => {
      this.wsClients.add(ws);
      this.sendInitialSync(ws).catch(err => {
        console.error('[CV Engine] Error sending initial sync:', err);
      });

      ws.on('message', (data: string) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          }
        } catch (e) {
          // ignore non-json messages
        }
      });

      ws.on('close', () => {
        this.wsClients.delete(ws);
      });

      ws.on('error', () => {
        this.wsClients.delete(ws);
      });
    });
  }

  public async reloadConfiguration(): Promise<void> {
    const [cameras, students, seats, settings] = await Promise.all([
      db.getCameras(),
      db.getStudents(),
      db.getSeats(),
      db.getSettings()
    ]);
    this.settings = settings;
    this.seats = seats;
    this.unifiedStudentManager.updateSeats(seats);
    this.unifiedStudentManager.updateStudentList(students);
    this.unifiedStudentManager.setThresholds({
      warning_suspicion_threshold: settings.thresholds.warning_suspicion_threshold,
      high_suspicion_threshold: settings.thresholds.high_suspicion_threshold
    });
    this.behaviorAnalyzer.updateConfig(settings.thresholds, settings.suspicion_weights);
    this.syncCameras(cameras);
  }

  public registerClient(ws: WebSocket): void {
    this.wsClients.add(ws);
    this.sendInitialSync(ws).catch(err => {
      console.error('[CV Engine] Error sending initial sync:', err);
    });
  }

  public unregisterClient(ws: WebSocket): void {
    this.wsClients.delete(ws);
  }

  public getCurrentTelemetry(): RealtimeStateMessage {
    return {
      type: 'TELEMETRY_UPDATE',
      timestamp: Date.now(),
      tracks_by_camera: Object.fromEntries(this.latestTracksByCamera.entries()),
      students: this.latestUnifiedStudents,
      global_persons: this.latestGlobalPersons,
      stats: this.cachedStats
    };
  }

  public getStats(): SystemStats {
    return this.cachedStats;
  }

  public getCameraSvgFrame(cameraId: string): string | null {
    const cam = this.cameras.get(cameraId);
    if (!cam) return null;
    const tracks = this.latestTracksByCamera.get(cameraId) || [];
    const statusColor = cam.status === 'online' ? '#10b981' : '#ef4444';
    const timestamp = new Date().toLocaleTimeString();
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
      <rect width="640" height="360" fill="#090d16" />
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="0.5"/>
      </pattern>
      <rect width="640" height="360" fill="url(#grid)" />
      <circle cx="20" cy="20" r="5" fill="${statusColor}" />
      <text x="32" y="24" fill="#f8fafc" font-family="monospace" font-size="12" font-weight="bold">${cam.name} [${cam.camera_id}]</text>
      <text x="620" y="24" fill="#94a3b8" font-family="monospace" font-size="11" text-anchor="end">${timestamp}</text>
      ${tracks.map(t => {
        const x = t.bbox.x * 640;
        const y = t.bbox.y * 360;
        const w = t.bbox.width * 640;
        const h = t.bbox.height * 360;
        const color = t.warning_latched || (t.suspicion_score || 0) >= 65 ? '#ef4444' : ((t.suspicion_score || 0) >= 35 ? '#eab308' : '#10b981');
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="1.5"/>
        <rect x="${x}" y="${Math.max(0, y - 14)}" width="${Math.min(100, w)}" height="14" fill="${color}"/>
        <text x="${x + 4}" y="${Math.max(10, y - 3)}" fill="#000" font-family="monospace" font-size="9" font-weight="bold">${t.track_id} (${Math.round(t.suspicion_score || 0)})</text>`;
      }).join('')}
    </svg>`;
  }

  public getSnapshot(): {
    tracks_by_camera: Record<string, CameraTrack[]>;
    students: StudentRecord[];
    global_persons: GlobalPerson[];
    stats: SystemStats;
  } {
    return {
      tracks_by_camera: Object.fromEntries(this.latestTracksByCamera.entries()),
      students: this.latestUnifiedStudents,
      global_persons: this.latestGlobalPersons,
      stats: this.cachedStats
    };
  }

  public reset(): void {
    for (const tracker of this.trackers.values()) {
      tracker.reset();
    }
    this.unifiedStudentManager.reset();
    this.cameraDetectionsQueue.clear();
    this.cameraPhonesQueue.clear();
    this.latestTracksByCamera.clear();
    this.latestUnifiedStudents = this.unifiedStudentManager.getStudents();
    this.latestGlobalPersons = [];
  }
}
