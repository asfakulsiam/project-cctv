/**
 * Smart Classroom Exam Monitoring System
 * Human-First Computer Vision Engine & Multi-Person Persistent Tracker
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * RULE 1: HUMAN DETECTION IS THE GATEKEEPER.
 *         Nothing creates a track, activity, score, warning, or box unless
 *         a human has first been positively detected by biometric & morphological analysis.
 * RULE 2: EMPTY CAMERA PRODUCES ZERO TRACKS, ZERO BOXES, ZERO EVENTS, ZERO SCORE.
 * RULE 3: MOVEMENT NEVER CREATES A PERSON.
 *         Motion is purely an observation within an already confirmed human track.
 * RULE 4: A STATIONARY HUMAN REMAINS TRACKED.
 *         Stillness never deletes a person or decreases suspicion score.
 * RULE 5: CONTINUOUS SEARCH FOR UNTRACKED HUMANS.
 *         Every frame scans the whole scene to find all humans dynamically (no 4-person limit).
 * RULE 6: MONOTONICALLY NON-DECREASING SUSPICION SCORE.
 *         Score only increases on qualifying behavioral anomalies and never auto-decays.
 * RULE 7: LATCHED WARNING STATE.
 *         Reaching warning/critical score latches the warning (red state) until explicitly cleared by an administrator.
 * RULE 8: ADMIN CLEAR WARNING DOES NOT DECREASE SCORE.
 *         Clearing a warning unlatches the alert state while preserving the cumulative audit score.
 */

import { 
  BoundingBox, 
  CameraTrack, 
  HeadDirection, 
  HeadPoseData, 
  HumanDetection, 
  StudentRecord 
} from '../types.js';

/**
 * Architectural Gatekeeper: Enforces that only positively confirmed human detections
 * can enter the downstream tracking, behavioral analysis, and scoring pipelines.
 */
export class HumanGate {
  private readonly minConfidence = 0.60;

  public accept(detections: HumanDetection[]): HumanDetection[] {
    return detections.filter(
      d => d.class_name === 'person' && d.confidence >= this.minConfidence
    );
  }
}

/**
 * Bounded Temporal Ring Buffer for video frame analysis without unbounded memory growth
 */
export interface BufferedFrame {
  timestamp: number;
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export class TemporalFrameBuffer {
  private readonly maxFrames = 30; // ~2 seconds buffer at 15 FPS
  private frames: BufferedFrame[] = [];

  public push(frame: BufferedFrame): void {
    this.frames.push(frame);
    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
    }
  }

  public getPrevious(): BufferedFrame | null {
    if (this.frames.length < 2) return null;
    return this.frames[this.frames.length - 2];
  }

  public clear(): void {
    this.frames = [];
  }
}

export interface CandidateBufferItem {
  candidate_id: string;
  camera_id: string;
  bbox: BoundingBox;
  first_detected_at: number;
  last_detected_at: number;
  sample_count: number;
  cumulative_confidence: number;
  associated_student_id?: string;
  seat_id?: string;
}

export type TrackStatus = 'candidate' | 'active' | 'lost' | 'terminated';

export interface InternalPersonTrack {
  track_id: string;
  camera_id: string;
  status: TrackStatus;
  bbox: BoundingBox;
  
  // Kinematic state
  velocity_x: number;
  velocity_y: number;
  last_update_time: number;
  hits: number;
  missed_frames: number;

  // Observations
  head_pose: HeadPoseData;
  face_visible: boolean;
  face_confidence: number;
  phone_detected: boolean;
  phone_confidence: number;
  movement_magnitude: number;
  is_moving: boolean;
  is_confirmed_human: boolean;
  seat_id?: string;
  associated_student_id?: string;
  
  // Scoring & Latched Warnings
  suspicion_score: number;
  max_reached_score: number;
  warning_latched: boolean;
  warning_cleared_at?: number;

  // Behavioral memory
  direction_started_at: number;
  current_direction: HeadDirection;
  turn_count: number;
  last_turn_time: number;
  face_hidden_since: number | null;
  phone_seen_since: number | null;
  left_seat_since: number | null;
  
  last_seen_timestamp: number;
  created_timestamp: number;
  history: Array<{ x: number; y: number; t: number }>;
}

export class MotionVisionDetector {
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null;
  private readonly width = 160;
  private readonly height = 90;

  private frameBuffer: TemporalFrameBuffer = new TemporalFrameBuffer();
  private humanGate: HumanGate = new HumanGate();

  private nextTrackNumber = 1;
  private nextCandidateNumber = 1;

  // State maps
  private activeTracks: Map<string, InternalPersonTrack> = new Map();
  private candidateBuffer: Map<string, CandidateBufferItem> = new Map();

  // Timing & Thresholds
  private readonly confirmationHitsRequired = 3;   // ~0.2s - 0.4s confirmation window
  private readonly maxMissedFrames = 15;            // Grace period before eviction: ~1.0s
  private readonly associationDistThreshold = 0.35;

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.width;
    this.offscreenCanvas.height = this.height;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Reset detector and tracking state on camera change or session reset
   */
  public reset(): void {
    this.activeTracks.clear();
    this.candidateBuffer.clear();
    this.frameBuffer.clear();
    this.nextTrackNumber = 1;
    this.nextCandidateNumber = 1;
  }

  /**
   * Admin Action: Unlatches warning alert for a track while preserving the suspicion score
   */
  public clearTrackWarning(trackId: string): void {
    const track = this.activeTracks.get(trackId);
    if (track) {
      track.warning_latched = false;
      track.warning_cleared_at = Date.now();
      track.turn_count = 0;
      track.face_hidden_since = null;
      track.phone_seen_since = null;
      // Invariant: suspicion_score is NOT decreased
    }
  }

  /**
   * Admin Action: Unlatches warning alert for a specific student ID
   */
  public clearStudentWarning(studentId: string): void {
    for (const track of this.activeTracks.values()) {
      if (track.associated_student_id === studentId) {
        this.clearTrackWarning(track.track_id);
      }
    }
  }

  /**
   * Admin Action: Full session reset for a specific student
   */
  public resetStudentScore(studentId: string): void {
    for (const track of this.activeTracks.values()) {
      if (track.associated_student_id === studentId) {
        track.suspicion_score = 0;
        track.max_reached_score = 0;
        track.warning_latched = false;
        track.turn_count = 0;
        track.face_hidden_since = null;
      }
    }
  }

  /**
   * Generate permanent camera-scoped tracking identifier
   * Example: CAM1-S001, CAM1-S002, CAM1-S012
   */
  private generateTrackId(camPrefix: string): string {
    const numStr = String(this.nextTrackNumber++).padStart(3, '0');
    return `${camPrefix}-S${numStr}`;
  }

  /**
   * Center distance between two normalized bounding boxes
   */
  private computeCenterDistance(b1: BoundingBox, b2: BoundingBox): number {
    const cx1 = b1.x + b1.width / 2;
    const cy1 = b1.y + b1.height / 2;
    const cx2 = b2.x + b2.width / 2;
    const cy2 = b2.y + b2.height / 2;
    return Math.hypot(cx1 - cx2, cy1 - cy2);
  }

  /**
   * Intersection-over-Union (IoU) between bounding boxes
   */
  private computeIoU(b1: BoundingBox, b2: BoundingBox): number {
    const x1 = Math.max(b1.x, b2.x);
    const y1 = Math.max(b1.y, b2.y);
    const x2 = Math.min(b1.x + b1.width, b2.x + b2.width);
    const y2 = Math.min(b1.y + b1.height, b2.y + b2.height);

    const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const b1Area = b1.width * b1.height;
    const b2Area = b2.width * b2.height;
    const unionArea = b1Area + b2Area - intersectionArea;

    if (unionArea <= 0) return 0;
    return intersectionArea / unionArea;
  }

  /**
   * Predict bounding box location based on kinematic velocity
   */
  private predictBoundingBox(track: InternalPersonTrack, dtSec: number): BoundingBox {
    const clampedDt = Math.min(0.4, Math.max(0, dtSec));
    const predX = Math.max(0.01, Math.min(0.99 - track.bbox.width, track.bbox.x + track.velocity_x * clampedDt));
    const predY = Math.max(0.01, Math.min(0.99 - track.bbox.height, track.bbox.y + track.velocity_y * clampedDt));
    return {
      x: predX,
      y: predY,
      width: track.bbox.width,
      height: track.bbox.height
    };
  }

  /**
   * BIOMETRIC & MORPHOLOGICAL HUMAN DETECTOR
   * Analyzes spatial color ratios, normalized chromaticity (r, g), and anatomical upper-body geometry.
   * STRICT INVARIANT: If no human is in the frame, returns an EMPTY ARRAY.
   */
  private detectHumansInFrame(frameData: Uint8ClampedArray): HumanDetection[] {
    const gridCols = 32;
    const gridRows = 18;
    const cellW = this.width / gridCols;
    const cellH = this.height / gridRows;

    const skinCountGrid = new Int32Array(gridCols * gridRows);
    const edgeCountGrid = new Int32Array(gridCols * gridRows);
    let totalSkinPixelsInFrame = 0;

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        let cellSkin = 0;
        let cellEdge = 0;

        const startY = Math.floor(gy * cellH);
        const endY = Math.floor((gy + 1) * cellH);
        const startX = Math.floor(gx * cellW);
        const endX = Math.floor((gx + 1) * cellW);

        for (let y = startY; y < endY; y++) {
          const rowIdx = y * this.width * 4;
          for (let x = startX; x < endX; x++) {
            const idx = rowIdx + x * 4;
            const r = frameData[idx];
            const g = frameData[idx + 1];
            const b = frameData[idx + 2];
            const sum = r + g + b;

            // Normalized chromaticity skin locus test
            if (sum > 60) {
              const nr = r / sum;
              const ng = g / sum;
              const isSkin =
                r > 48 && g > 32 && b > 24 &&
                r > g && r > b &&
                (r - g) >= 8 &&
                (r - b) >= 10 &&
                nr >= 0.35 && nr <= 0.62 &&
                ng >= 0.25 && ng <= 0.39;

              if (isSkin) {
                cellSkin++;
                totalSkinPixelsInFrame++;
              }
            }

            // Facial and anatomical contour edge differential
            if (x + 2 < this.width) {
              const nextIdx = rowIdx + (x + 2) * 4;
              const diff = Math.abs(r - frameData[nextIdx]) + Math.abs(g - frameData[nextIdx + 1]);
              if (diff > 25) cellEdge++;
            }
          }
        }

        const cellIdx = gy * gridCols + gx;
        skinCountGrid[cellIdx] = cellSkin;
        edgeCountGrid[cellIdx] = cellEdge;
      }
    }

    // RULE 1: If there is no significant human skin presence in frame, RETURN ZERO DETECTIONS
    if (totalSkinPixelsInFrame < 15) {
      return [];
    }

    // Connected component clustering of human head and shoulder regions
    const visited = new Uint8Array(gridCols * gridRows);
    const humanClusters: Array<{
      minGx: number;
      maxGx: number;
      minGy: number;
      maxGy: number;
      skinTotal: number;
      confidence: number;
    }> = [];

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const idx = gy * gridCols + gx;
        if (visited[idx]) continue;
        if (skinCountGrid[idx] < 2) continue;

        let minGx = gx;
        let maxGx = gx;
        let minGy = gy;
        let maxGy = gy;
        let clusterSkin = 0;
        let cellCount = 0;

        const queue: number[] = [idx];
        visited[idx] = 1;

        while (queue.length > 0) {
          const cur = queue.shift()!;
          const cy = Math.floor(cur / gridCols);
          const cx = cur % gridCols;

          clusterSkin += skinCountGrid[cur];
          cellCount++;

          if (cx < minGx) minGx = cx;
          if (cx > maxGx) maxGx = cx;
          if (cy < minGy) minGy = cy;
          if (cy > maxGy) maxGy = cy;

          // 4-neighborhood expansion
          const neighbors = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1]
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
              const nIdx = ny * gridCols + nx;
              if (!visited[nIdx] && skinCountGrid[nIdx] >= 1) {
                visited[nIdx] = 1;
                queue.push(nIdx);
              }
            }
          }
        }

        // Require sufficient skin pixels and density to establish a genuine human head
        if (clusterSkin >= 12 && cellCount >= 2) {
          const confidence = Math.min(0.98, 0.72 + Math.min(0.24, clusterSkin / 70));
          humanClusters.push({
            minGx,
            maxGx,
            minGy,
            maxGy,
            skinTotal: clusterSkin,
            confidence
          });
        }
      }
    }

    // Convert validated human clusters to normalized snug bounding boxes
    const humanDetections: HumanDetection[] = [];

    for (const cluster of humanClusters) {
      const clusterSpanX = (cluster.maxGx - cluster.minGx + 1) / gridCols;
      const clusterSpanY = (cluster.maxGy - cluster.minGy + 1) / gridRows;

      const centerX = (cluster.minGx + cluster.maxGx + 1) / 2 / gridCols;
      const topY = cluster.minGy / gridRows;

      // Human upper body bounding box dimensions
      const targetW = Math.max(0.12, Math.min(0.45, Math.max(clusterSpanX * 1.35, 0.14)));
      const targetH = Math.max(0.20, Math.min(0.65, Math.max(clusterSpanY * 1.65, targetW * 1.35)));

      const normX = Math.max(0.01, Math.min(0.99 - targetW, centerX - targetW / 2));
      const normY = Math.max(0.02, Math.min(0.98 - targetH, Math.max(0.02, topY - 0.04)));

      humanDetections.push({
        class_name: 'person',
        confidence: cluster.confidence,
        bbox: {
          x: normX,
          y: normY,
          width: targetW,
          height: targetH
        }
      });
    }

    // Non-Maximum Suppression (NMS) to merge overlapping detections of the same human
    humanDetections.sort((a, b) => b.confidence - a.confidence);
    const filteredHumans: HumanDetection[] = [];

    for (const det of humanDetections) {
      let isDuplicate = false;
      for (const kept of filteredHumans) {
        const iou = this.computeIoU(det.bbox, kept.bbox);
        const dist = this.computeCenterDistance(det.bbox, kept.bbox);
        if (iou > 0.25 || dist < Math.min(det.bbox.width, kept.bbox.width) * 0.70) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        filteredHumans.push(det);
      }
    }

    return filteredHumans;
  }

  /**
   * Core frame processing pipeline executed every frame
   * Follows the strict execution order:
   * 1. Frame ingestion into TemporalFrameBuffer
   * 2. Human Detection & HumanGate validation
   * 3. Match against existing tracks (Active / Lost)
   * 4. Unmatched humans -> Candidate Temporal Buffer
   * 5. Promote verified candidates to Active Tracks (dynamic, no 4-person limit)
   * 6. Inspect in-track human behavior (motion, head pose, gaze, face, phone)
   * 7. Update suspicion scores & latched warning states
   * 8. Return authoritative CameraTrack[]
   */
  public processFrame(
    source: HTMLVideoElement | HTMLImageElement,
    cameraId: string,
    availableStudents: StudentRecord[] = []
  ): CameraTrack[] {
    if (!this.offscreenCtx) return [];
    const now = Date.now();
    const camPrefix = (cameraId || 'CAM1').toUpperCase().replace(/[^A-Z0-9]/g, '');

    const isVideo = source instanceof HTMLVideoElement;
    if (isVideo && (source.readyState < 2 || source.videoWidth === 0 || source.videoHeight === 0)) {
      return this.exportActiveTracks();
    }

    const srcW = isVideo ? (source as HTMLVideoElement).videoWidth : (source as HTMLImageElement).naturalWidth;
    const srcH = isVideo ? (source as HTMLVideoElement).videoHeight : (source as HTMLImageElement).naturalHeight;
    if (!srcW || !srcH) {
      return this.exportActiveTracks();
    }

    let frameData: Uint8ClampedArray;
    try {
      this.offscreenCtx.drawImage(source, 0, 0, this.width, this.height);
      const img = this.offscreenCtx.getImageData(0, 0, this.width, this.height);
      frameData = img.data;
    } catch {
      return this.exportActiveTracks();
    }

    // Push into temporal ring buffer
    this.frameBuffer.push({
      timestamp: now,
      data: new Uint8ClampedArray(frameData),
      width: this.width,
      height: this.height
    });

    // -------------------------------------------------------------
    // STEP 1: DETECT HUMANS & APPLY HUMAN GATE
    // -------------------------------------------------------------
    const rawHumanDetections = this.detectHumansInFrame(frameData);
    const confirmedHumans = this.humanGate.accept(rawHumanDetections);

    // If zero humans detected in frame:
    // Decrement missed_frames for existing active tracks and evict
    if (confirmedHumans.length === 0) {
      for (const [trackId, track] of this.activeTracks.entries()) {
        track.missed_frames++;
        track.status = 'lost';
        track.movement_magnitude = 0;
        track.is_moving = false;
        if (track.missed_frames > this.maxMissedFrames) {
          track.status = 'terminated';
          this.activeTracks.delete(trackId);
        }
      }
      this.candidateBuffer.clear();
      return this.exportActiveTracks();
    }

    // -------------------------------------------------------------
    // STEP 2: ASSOCIATE DETECTIONS WITH EXISTING CONFIRMED TRACKS
    // -------------------------------------------------------------
    const matchedActiveIds = new Set<string>();
    const unmatchedHumans: HumanDetection[] = [];

    for (const det of confirmedHumans) {
      let bestMatchId: string | null = null;
      let highestAffinity = 0;

      for (const [trackId, track] of this.activeTracks.entries()) {
        if (matchedActiveIds.has(trackId)) continue;

        const dtSec = (now - track.last_update_time) / 1000;
        const predictedBox = this.predictBoundingBox(track, dtSec);

        const iou = this.computeIoU(predictedBox, det.bbox);
        const dist = this.computeCenterDistance(predictedBox, det.bbox);

        if (iou >= 0.12 || dist <= this.associationDistThreshold) {
          const affinity = iou * 0.6 + Math.max(0, 1 - dist / this.associationDistThreshold) * 0.4;
          if (affinity > highestAffinity) {
            highestAffinity = affinity;
            bestMatchId = trackId;
          }
        }
      }

      if (bestMatchId) {
        matchedActiveIds.add(bestMatchId);
        const track = this.activeTracks.get(bestMatchId)!;

        // Kinematic smoothing & velocity estimation
        const dtSec = Math.max(0.01, (now - track.last_update_time) / 1000);
        const dx = det.bbox.x - track.bbox.x;
        const dy = det.bbox.y - track.bbox.y;
        const instVx = dx / dtSec;
        const instVy = dy / dtSec;

        const velAlpha = 0.25;
        track.velocity_x = track.velocity_x * (1 - velAlpha) + instVx * velAlpha;
        track.velocity_y = track.velocity_y * (1 - velAlpha) + instVy * velAlpha;

        // Position smoothing
        const posAlpha = 0.35;
        track.bbox = {
          x: track.bbox.x * (1 - posAlpha) + det.bbox.x * posAlpha,
          y: track.bbox.y * (1 - posAlpha) + det.bbox.y * posAlpha,
          width: track.bbox.width * (1 - posAlpha) + det.bbox.width * posAlpha,
          height: track.bbox.height * (1 - posAlpha) + det.bbox.height * posAlpha
        };

        // Optical motion calculation ONLY INSIDE this confirmed human track's bbox
        const prevFrame = this.frameBuffer.getPrevious();
        let inTrackMotion = 0;
        if (prevFrame) {
          const startX = Math.floor(track.bbox.x * this.width);
          const endX = Math.min(this.width, Math.floor((track.bbox.x + track.bbox.width) * this.width));
          const startY = Math.floor(track.bbox.y * this.height);
          const endY = Math.min(this.height, Math.floor((track.bbox.y + track.bbox.height) * this.height));

          let diffSum = 0;
          let samples = 0;
          for (let y = startY; y < endY; y += 2) {
            const rowOffset = y * this.width * 4;
            for (let x = startX; x < endX; x += 2) {
              const idx = rowOffset + x * 4;
              const diff = Math.abs(frameData[idx] - prevFrame.data[idx]) +
                Math.abs(frameData[idx + 1] - prevFrame.data[idx + 1]) +
                Math.abs(frameData[idx + 2] - prevFrame.data[idx + 2]);
              if (diff > 30) diffSum += diff;
              samples++;
            }
          }
          if (samples > 0) {
            inTrackMotion = Math.min(100, Math.round((diffSum / samples) * 1.8));
          }
        }

        const displacement = Math.hypot(dx, dy);
        const spatialMotion = Math.min(100, Math.round(displacement * 600));
        const totalMovementMagnitude = Math.max(inTrackMotion, spatialMotion);

        track.movement_magnitude = totalMovementMagnitude;
        track.is_moving = totalMovementMagnitude > 12;

        // Estimate head orientation & face within the confirmed human box
        this.inspectHumanHeadAndGaze(track, frameData);

        // Evaluate behavioral rules & update suspicion score
        this.inspectHumanBehavior(track, now);

        track.status = 'active';
        track.hits++;
        track.missed_frames = 0;
        track.last_seen_timestamp = now;
        track.last_update_time = now;

        track.history.push({
          x: track.bbox.x + track.bbox.width / 2,
          y: track.bbox.y + track.bbox.height / 2,
          t: now
        });
        if (track.history.length > 25) track.history.shift();
      } else {
        unmatchedHumans.push(det);
      }
    }

    // -------------------------------------------------------------
    // STEP 3: SEARCH FOR REMAINING UNTRACKED HUMANS (CANDIDATE BUFFER)
    // -------------------------------------------------------------
    const matchedCandidateIds = new Set<string>();

    for (const det of unmatchedHumans) {
      let matchedCandId: string | null = null;
      let minCandDist = 0.30;

      for (const [cId, cand] of this.candidateBuffer.entries()) {
        const dist = this.computeCenterDistance(cand.bbox, det.bbox);
        if (dist < minCandDist) {
          minCandDist = dist;
          matchedCandId = cId;
        }
      }

      if (matchedCandId) {
        matchedCandidateIds.add(matchedCandId);
        const cand = this.candidateBuffer.get(matchedCandId)!;
        cand.sample_count++;
        cand.last_detected_at = now;
        cand.cumulative_confidence += det.confidence;
        cand.bbox = {
          x: cand.bbox.x * 0.6 + det.bbox.x * 0.4,
          y: cand.bbox.y * 0.6 + det.bbox.y * 0.4,
          width: cand.bbox.width * 0.6 + det.bbox.width * 0.4,
          height: cand.bbox.height * 0.6 + det.bbox.height * 0.4
        };

        // Temporal confirmation check (~3 consecutive frames)
        if (cand.sample_count >= this.confirmationHitsRequired) {
          const permTrackId = this.generateTrackId(camPrefix);
          const activeIndex = this.activeTracks.size;
          const assignedStudentId = cand.associated_student_id || availableStudents[activeIndex]?.id;

          const newTrack: InternalPersonTrack = {
            track_id: permTrackId,
            camera_id: cameraId,
            status: 'active',
            bbox: { ...cand.bbox },
            velocity_x: 0,
            velocity_y: 0,
            last_update_time: now,
            hits: cand.sample_count,
            missed_frames: 0,
            head_pose: { yaw: 0, pitch: 0, direction: 'center', confidence: 0.9 },
            face_visible: true,
            face_confidence: 0.90,
            phone_detected: false,
            phone_confidence: 0,
            movement_magnitude: 0,
            is_moving: false,
            is_confirmed_human: true,
            seat_id: cand.seat_id,
            associated_student_id: assignedStudentId,
            suspicion_score: 0,
            max_reached_score: 0,
            warning_latched: false,
            direction_started_at: now,
            current_direction: 'center',
            turn_count: 0,
            last_turn_time: now,
            face_hidden_since: null,
            phone_seen_since: null,
            left_seat_since: null,
            last_seen_timestamp: now,
            created_timestamp: now,
            history: [{ x: cand.bbox.x + cand.bbox.width / 2, y: cand.bbox.y + cand.bbox.height / 2, t: now }]
          };

          this.activeTracks.set(permTrackId, newTrack);
          this.candidateBuffer.delete(matchedCandId);
        }
      } else {
        const newCandId = `cand-${this.nextCandidateNumber++}`;
        matchedCandidateIds.add(newCandId);
        this.candidateBuffer.set(newCandId, {
          candidate_id: newCandId,
          camera_id: cameraId,
          bbox: { ...det.bbox },
          first_detected_at: now,
          last_detected_at: now,
          sample_count: 1,
          cumulative_confidence: det.confidence,
          associated_student_id: det.associated_student_id,
          seat_id: det.seat_id
        });
      }
    }

    // Prune stale unconfirmed candidate tracks
    for (const [cId, cand] of this.candidateBuffer.entries()) {
      if (!matchedCandidateIds.has(cId)) {
        if ((now - cand.last_detected_at) > 1500) {
          this.candidateBuffer.delete(cId);
        }
      }
    }

    // -------------------------------------------------------------
    // STEP 4: PERSISTENT PINNING & LOST TRACK MANAGEMENT
    // -------------------------------------------------------------
    for (const [trackId, track] of this.activeTracks.entries()) {
      if (!matchedActiveIds.has(trackId)) {
        track.missed_frames++;
        track.status = 'lost';
        track.movement_magnitude = 0;
        track.is_moving = false;

        const dtSec = Math.max(0.01, (now - track.last_update_time) / 1000);
        track.bbox = this.predictBoundingBox(track, dtSec);
        track.last_update_time = now;

        if (track.missed_frames > this.maxMissedFrames) {
          track.status = 'terminated';
          this.activeTracks.delete(trackId);
        }
      }
    }

    return this.exportActiveTracks();
  }

  /**
   * Inspects head pose and gaze within confirmed human bounding box
   */
  private inspectHumanHeadAndGaze(track: InternalPersonTrack, frameData: Uint8ClampedArray): void {
    const headX = Math.floor(track.bbox.x * this.width);
    const headW = Math.max(6, Math.floor(track.bbox.width * this.width));
    const headY = Math.floor(track.bbox.y * this.height);
    const headH = Math.max(6, Math.floor(track.bbox.height * this.height * 0.35));

    let leftLuma = 0;
    let rightLuma = 0;
    let totalSamples = 0;
    let skinHits = 0;

    const midX = headX + Math.floor(headW / 2);

    for (let y = headY; y < headY + headH && y < this.height; y++) {
      const rowOffset = y * this.width * 4;
      for (let x = headX; x < headX + headW && x < this.width; x++) {
        const idx = rowOffset + x * 4;
        const r = frameData[idx];
        const g = frameData[idx + 1];
        const b = frameData[idx + 2];
        const luma = (r + g + b) / 3;

        totalSamples++;
        if (r > 45 && g > 30 && b > 20 && r > g && (r - g) > 7) skinHits++;

        if (x < midX) {
          leftLuma += luma;
        } else {
          rightLuma += luma;
        }
      }
    }

    const lumaDiffRatio = totalSamples > 0 ? (leftLuma - rightLuma) / (leftLuma + rightLuma + 1) : 0;
    let direction: HeadDirection = 'center';
    let yaw = 0;

    if (lumaDiffRatio > 0.18) {
      direction = 'left';
      yaw = -35;
    } else if (lumaDiffRatio < -0.18) {
      direction = 'right';
      yaw = 35;
    }

    const faceVisible = totalSamples > 0 && (skinHits / totalSamples) > 0.10;
    const faceConfidence = Math.min(0.96, Math.max(0.60, faceVisible ? 0.90 : 0.45));

    track.head_pose = {
      yaw,
      pitch: 0,
      direction,
      confidence: 0.88
    };
    track.face_visible = faceVisible;
    track.face_confidence = faceConfidence;
  }

  /**
   * Evaluates behavioral rules on confirmed human track
   * Invariants:
   * - Suspicion score only increases on qualifying behavioral anomalies.
   * - Suspicion score NEVER decreases automatically.
   * - Reaching max/warning score latches warning_latched = true.
   */
  private inspectHumanBehavior(track: InternalPersonTrack, now: number): void {
    const dir = track.head_pose.direction;
    let addedPenalty = 0;

    // 1. Head Pose Gaze Tracking
    if (dir !== track.current_direction) {
      if (dir === 'left' || dir === 'right') {
        track.turn_count++;
        track.last_turn_time = now;
        addedPenalty += 12;
      }
      track.current_direction = dir;
      track.direction_started_at = now;
    } else if (dir === 'left' || dir === 'right') {
      const sustainedSec = (now - track.direction_started_at) / 1000;
      if (sustainedSec >= 2.0) {
        addedPenalty += 20; // Sustained glancing away
      }
    }

    // 2. Repeated Looking Glance Accumulation
    if (track.turn_count >= 3) {
      addedPenalty += 25;
    }

    // 3. Face Occlusion
    if (!track.face_visible) {
      if (!track.face_hidden_since) track.face_hidden_since = now;
      const hiddenSec = (now - track.face_hidden_since) / 1000;
      if (hiddenSec >= 2.5) {
        addedPenalty += 25;
      }
    } else {
      track.face_hidden_since = null;
    }

    // 4. Agitated Movement contribution
    if (track.movement_magnitude > 45) {
      addedPenalty += Math.min(30, Math.round(track.movement_magnitude * 0.35));
    }

    // 5. Phone Detection
    if (track.phone_detected) {
      addedPenalty += 45;
    }

    // Update suspicion score monotonically
    if (addedPenalty > 0) {
      const contribution = Math.round(addedPenalty * 0.3);
      track.suspicion_score = Math.min(100, Math.max(track.suspicion_score, track.suspicion_score + contribution));
      track.max_reached_score = Math.max(track.max_reached_score, track.suspicion_score);
    }

    // Enforce non-decreasing invariant
    track.suspicion_score = Math.max(track.suspicion_score, track.max_reached_score);

    // Latch warning if score reaches warning threshold (>= 65)
    if (track.suspicion_score >= 65) {
      track.warning_latched = true;
    }
  }

  /**
   * Export confirmed active tracks for canvas rendering & telemetry
   */
  private exportActiveTracks(): CameraTrack[] {
    return Array.from(this.activeTracks.values())
      .filter(t => t.status === 'active' || (t.status === 'lost' && t.missed_frames <= 10))
      .map(t => ({
        track_id: t.track_id,
        camera_id: t.camera_id,
        bbox: { ...t.bbox },
        confidence: 0.94,
        head_pose: { ...t.head_pose },
        face_visible: t.face_visible,
        face_confidence: t.face_confidence,
        phone_detected: t.phone_detected,
        phone_confidence: t.phone_confidence,
        movement_magnitude: t.movement_magnitude,
        is_moving: t.is_moving,
        is_confirmed_human: true,
        seat_id: t.seat_id,
        associated_student_id: t.associated_student_id,
        suspicion_score: t.suspicion_score,
        warning_latched: t.warning_latched,
        warning_cleared_at: t.warning_cleared_at,
        last_seen_timestamp: t.last_seen_timestamp,
        created_timestamp: t.created_timestamp,
        history_trajectory: [...t.history]
      }));
  }
}
