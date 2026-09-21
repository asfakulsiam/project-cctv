/**
 * Smart Classroom Exam Monitoring System
 * Live Multi-Camera Computer Vision Engine & Video Pipeline
 * 
 * Manages independent camera pipelines, live frame loops, real-time CV detection,
 * tracking, behavior analysis, and WebSocket state broadcasts.
 */

import { WebSocket } from 'ws';
import { 
  AppSettings, 
  CameraConfig, 
  CameraTrack, 
  BehaviorEvent, 
  RealtimeStateMessage, 
  SeatRecord, 
  StudentRecord, 
  SystemStats 
} from '../../src/types.js';
import { db } from '../db.js';
import { CameraTracker } from './tracker.js';
import { BehaviorAnalyzer } from './behavior.js';
import { UnifiedStudentManager } from './unified_model.js';

export class MultiCameraCVEngine {
  private cameras: Map<string, CameraConfig> = new Map();
  private trackers: Map<string, CameraTracker> = new Map();
  private behaviorAnalyzer: BehaviorAnalyzer;
  private unifiedStudentManager: UnifiedStudentManager;
  private settings: AppSettings;
  private seats: SeatRecord[] = [];
  private wsClients: Set<WebSocket> = new Set();
  private isRunning = false;
  private loopTimer: NodeJS.Timeout | null = null;
  private cameraDetectionsQueue: Map<string, any[]> = new Map();
  private lastStatsCalcTime = 0;
  private cachedStats: SystemStats = {
    total_cameras: 0,
    online_cameras: 0,
    detected_persons: 0,
    present_students: 0,
    students_moving: 0,
    warning_count: 0,
    high_suspicion_count: 0,
    active_alerts: 0,
    processing_fps: 0,
    system_health: 'offline'
  };

  private latestTracksByCamera = new Map<string, CameraTrack[]>();
  private latestUnifiedStudents: StudentRecord[] = [];

  constructor(
    initialSettings: AppSettings,
    initialCameras: CameraConfig[],
    initialStudents: StudentRecord[],
    initialSeats: SeatRecord[]
  ) {
    this.settings = initialSettings;
    this.seats = initialSeats;

    // Initialize Behavior Engine
    this.behaviorAnalyzer = new BehaviorAnalyzer(
      'session-active',
      initialSettings.thresholds,
      initialSettings.suspicion_weights
    );

    // Initialize Unified Student Model
    this.unifiedStudentManager = new UnifiedStudentManager(initialStudents, initialSeats);

    // Register Cameras and create independent trackers
    for (const cam of initialCameras) {
      this.cameras.set(cam.camera_id, { ...cam });
      this.trackers.set(cam.camera_id, new CameraTracker(cam.camera_id));
    }
  }

  public registerClient(ws: WebSocket): void {
    this.wsClients.add(ws);
    // Send immediate initial sync payload
    this.sendInitialSync(ws);
  }

  public unregisterClient(ws: WebSocket): void {
    this.wsClients.delete(ws);
  }

  public async reloadConfiguration(): Promise<void> {
    this.settings = await db.getSettings();
    this.seats = await db.getSeats();
    const students = await db.getStudents();
    const cameras = await db.getCameras();

    this.behaviorAnalyzer.updateConfig(this.settings.thresholds, this.settings.suspicion_weights);
    this.unifiedStudentManager.updateSeats(this.seats);
    this.unifiedStudentManager.updateStudentList(students);

    // Sync cameras
    const existingCamIds = new Set(this.cameras.keys());
    for (const cam of cameras) {
      this.cameras.set(cam.camera_id, { ...cam });
      if (!this.trackers.has(cam.camera_id)) {
        this.trackers.set(cam.camera_id, new CameraTracker(cam.camera_id));
      }
      existingCamIds.delete(cam.camera_id);
    }
    // Delete removed cameras
    for (const staleId of existingCamIds) {
      this.cameras.delete(staleId);
      this.trackers.delete(staleId);
      this.cameraDetectionsQueue.delete(staleId);
    }
  }

  public injectCameraDetections(cameraId: string, detections: any[]): void {
    this.cameraDetectionsQueue.set(cameraId, detections);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[CV Engine] Multi-camera processing engine started at', this.settings.processing_fps, 'FPS');
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

    const registeredStudents = this.unifiedStudentManager.getStudents();

    // Run independent per-camera detection & tracking
    for (const [cameraId, camera] of this.cameras.entries()) {
      if (camera.status !== 'online' || camera.enabled === false) {
        cameraTracksMap.set(cameraId, []);
        continue;
      }

      const tracker = this.trackers.get(cameraId);
      if (!tracker) continue;

      // Ingest detections from real camera vision detector
      const rawDetections = this.cameraDetectionsQueue.get(cameraId) || [];
      this.cameraDetectionsQueue.delete(cameraId);

      // INDEPENDENT PER-CAMERA TRACKING: If no humans detected, tracks are 0
      const tracks = tracker.updateDetections(rawDetections, now);

      // Evaluate temporal behavior and scoring for each real track
      for (const track of tracks) {
        allActiveTrackIds.add(track.track_id);
        const studentInfo = registeredStudents.find(s => s.id === track.associated_student_id);
        const seat = this.seats.find(s => s.id === track.seat_id);
        const seatRegion = seat?.camera_regions[cameraId];

        const { events, suspicion_score } = this.behaviorAnalyzer.analyzeTrack(
          track,
          studentInfo ? { name: studentInfo.name, student_id_number: studentInfo.student_id_number } : undefined,
          seatRegion,
          now
        );

        track.suspicion_score = suspicion_score;
        tracker.setTrackSuspicion(track.track_id, suspicion_score);

        for (const evt of events) {
          newEvents.push(evt);
          await db.recordEvent(evt);
        }
      }

      cameraTracksMap.set(cameraId, tracks);
    }

    this.behaviorAnalyzer.pruneStaleContexts(allActiveTrackIds);

    // UNIFIED STUDENT MODEL (cross-camera association without duplicating students)
    const cameraList = Array.from(this.cameras.values());
    const unifiedStudents = this.unifiedStudentManager.syncCrossCameraObservations(
      cameraTracksMap,
      cameraList,
      now
    );

    // Calculate Real-Time Stats
    const stats = this.computeRealtimeStats(cameraTracksMap, unifiedStudents, newEvents.length);

    this.latestTracksByCamera = cameraTracksMap;
    this.latestUnifiedStudents = unifiedStudents;

    // Broadcast Real-Time State over WebSockets
    this.broadcastTelemetry({
      type: 'TELEMETRY_UPDATE',
      timestamp: now,
      tracks_by_camera: Object.fromEntries(cameraTracksMap.entries()),
      students: unifiedStudents,
      stats,
      new_event: newEvents.length > 0 ? newEvents[newEvents.length - 1] : undefined
    });
  }



  /**
   * Toggle camera status (e.g., simulate camera disconnect / reconnect).
   */
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
    newEventsCount: number
  ): SystemStats {
    let totalOnline = 0;
    for (const cam of this.cameras.values()) {
      if (cam.status === 'online' && cam.enabled !== false) totalOnline++;
    }

    // Deduplicated count across all camera tracking contexts
    const presentStudentsCount = students.filter(s => s.status === 'present' || s.status === 'flagged').length;
    
    // Moving students
    let movingCount = 0;
    for (const tracks of tracksByCamera.values()) {
      for (const t of tracks) {
        if (t.is_moving) movingCount++;
      }
    }

    // High suspicion / warning counts
    const highSuspicionCount = students.filter(s => s.unified_suspicion_score >= this.settings.thresholds.high_suspicion_threshold).length;
    const warningCount = students.filter(s => 
      s.unified_suspicion_score >= this.settings.thresholds.warning_suspicion_threshold && 
      s.unified_suspicion_score < this.settings.thresholds.high_suspicion_threshold
    ).length;

    // Total detected tracks on primary camera
    const primaryCamId = this.settings.default_primary_camera || (this.cameras.keys().next().value || '');
    const primaryTracks = tracksByCamera.get(primaryCamId) || [];

    const totalCameras = this.cameras.size;
    const isAnyCameraOnline = totalOnline > 0;

    const stats: SystemStats = {
      total_cameras: totalCameras,
      online_cameras: totalOnline,
      detected_persons: primaryTracks.length,
      present_students: presentStudentsCount,
      students_moving: Math.min(presentStudentsCount, movingCount),
      warning_count: warningCount,
      high_suspicion_count: highSuspicionCount,
      active_alerts: warningCount + highSuspicionCount,
      processing_fps: isAnyCameraOnline ? this.settings.processing_fps : 0,
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

  public getStats(): SystemStats {
    return this.cachedStats;
  }

  public getCurrentTelemetry(): {
    timestamp: number;
    tracks_by_camera: Record<string, CameraTrack[]>;
    students: StudentRecord[];
    stats: SystemStats;
    cameras: CameraConfig[];
  } {
    return {
      timestamp: Date.now(),
      tracks_by_camera: Object.fromEntries(this.latestTracksByCamera.entries()),
      students: this.latestUnifiedStudents.length > 0 ? this.latestUnifiedStudents : this.unifiedStudentManager.getStudents(),
      stats: this.cachedStats,
      cameras: Array.from(this.cameras.values())
    };
  }

  /**
   * Generates a clean, high-resolution vector video frame representing the camera's
   * optical surveillance stream of the classroom, strictly separate from detection metadata.
   * Does NOT generate fake student actors or fake bounding boxes.
   */
  public getCameraSvgFrame(cameraId: string): string {
    const cam = this.cameras.get(cameraId);
    const cameraName = cam ? cam.name : cameraId.toUpperCase();
    const isOnline = cam ? cam.status === 'online' && cam.enabled !== false : false;
    const now = new Date();
    const timeString = now.toISOString().replace('T', ' ').substring(0, 19);

    if (!cam || !isOnline) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="100%" height="100%">
        <rect width="960" height="540" fill="#020617"/>
        <text x="480" y="250" fill="#ef4444" font-family="monospace" font-size="20" font-weight="bold" text-anchor="middle">CAMERA OFFLINE / DISCONNECTED</text>
        <text x="480" y="285" fill="#64748b" font-family="monospace" font-size="14" text-anchor="middle">${cameraName} • No signal from stream source</text>
        <text x="480" y="315" fill="#475569" font-family="monospace" font-size="12" text-anchor="middle">Verify RTSP / USB stream credentials in Admin Console</text>
      </svg>`;
    }

    const resWidth = cam.resolution?.width || 1920;
    const resHeight = cam.resolution?.height || 1080;
    const fps = cam.actual_fps || cam.target_fps || 15;
    const sourceType = (cam.source_type || 'RTSP').toUpperCase();

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="100%" height="100%">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
      </defs>
      <!-- Background Optical Floor -->
      <rect width="960" height="540" fill="url(#bgGrad)"/>
      
      <!-- Surveillance Grid Lines -->
      <path d="M0,180 L960,180 M0,270 L960,270 M0,360 L960,360 M0,450 L960,450" stroke="#334155" stroke-width="0.75" opacity="0.4"/>
      <path d="M240,120 L240,540 M480,120 L480,540 M720,120 L720,540" stroke="#334155" stroke-width="0.75" opacity="0.3"/>

      <!-- Clean CCTV Surveillance OSD HUD (Watermark) -->
      <g opacity="0.9" font-family="'JetBrains Mono', monospace" font-size="11">
        <rect x="16" y="16" width="310" height="28" rx="4" fill="#020617" fill-opacity="0.8" stroke="#334155" stroke-width="1"/>
        <circle cx="32" cy="30" r="4" fill="#10b981"/>
        <text x="44" y="34" fill="#f8fafc" font-weight="bold">● LIVE</text>
        <text x="95" y="34" fill="#38bdf8">${cameraId.toUpperCase()}</text>
        <text x="155" y="34" fill="#94a3b8">|</text>
        <text x="170" y="34" fill="#e2e8f0">${timeString}</text>

        <!-- Right Side Camera Metrics -->
        <rect x="730" y="16" width="214" height="28" rx="4" fill="#020617" fill-opacity="0.8" stroke="#334155" stroke-width="1"/>
        <text x="742" y="34" fill="#38bdf8">${resWidth}x${resHeight}</text>
        <text x="825" y="34" fill="#94a3b8">@</text>
        <text x="840" y="34" fill="#10b981" font-weight="bold">${fps.toFixed(1)} FPS</text>
        <text x="900" y="34" fill="#06b6d4">${sourceType}</text>
      </g>
    </svg>`;
  }
}
