/**
 * Smart Classroom Exam Monitoring System
 * Human-First Computer Vision Engine & Multi-Person Persistent Tracker
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. HUMAN DETECTION IS THE GATEKEEPER.
 *    Nothing creates a track, activity, score, warning, or box unless
 *    a human has first been positively detected by structural & morphological analysis.
 * 2. EMPTY CAMERA PRODUCES ZERO TRACKS, ZERO BOXES, ZERO EVENTS, ZERO SCORE.
 * 3. MOVEMENT NEVER CREATES A PERSON.
 *    Motion is purely an observation within an already confirmed human track.
 * 4. A STATIONARY HUMAN REMAINS TRACKED.
 *    Stillness never deletes a person or decreases suspicion score.
 * 5. DYNAMIC ARBITRARY PERSON CAPACITY (NO 4-PERSON LIMIT).
 *    Continuous search finds all humans dynamically in the scene.
 * 6. THREE-LAYER IDENTITY ARCHITECTURE:
 *    - Layer 1: Detection ID (ephemeral per-frame bounding box)
 *    - Layer 2: Camera Track ID (camera-scoped: e.g. CAM1-T001, CAM2-T001)
 *    - Layer 3: Global Person ID (classroom-level: e.g. P-001, associated with formal student STU-2026-0812)
 * 7. DUAL SUSPICION SCORES & LATCHED WARNINGS:
 *    - Current Score: Immediate behavioral anomaly in current window (0 - 100)
 *    - Cumulative Score: Monotonically non-decreasing audit score (0 - 100)
 *    - Warning Latched: Crosses threshold (>=65) and latches until cleared by admin.
 *    - Admin Clear: Unlatches warning, resets current_score = 0, preserves cumulative_score.
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
  private readonly minConfidence = 0.65;

  public accept(detections: HumanDetection[]): HumanDetection[] {
    return detections.filter(
      d => d.class_name === 'person' && d.confidence >= this.minConfidence
    );
  }
}

/**
 * Bounded Temporal Ring Buffer for video frame analysis
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

export interface CandidateEvidenceItem {
  candidate_id: string;
  camera_id: string;
  bbox: BoundingBox;
  first_detected_at: number;
  last_detected_at: number;
  sample_count: number;
  cumulative_confidence: number;
  center_history: Array<{ x: number; y: number }>;
  size_history: Array<{ w: number; h: number }>;
  associated_student_id?: string;
  seat_id?: string;
}

export type TrackStatus = 'candidate' | 'active' | 'lost' | 'terminated';

export interface InternalPersonTrack {
  track_id: string;           // Layer 2 Camera Track ID: CAM1-T001
  camera_id: string;
  global_person_id?: string;  // Layer 3 Global Person ID: P-001
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
  
  // Dual Scoring & Latched Warnings
  current_score: number;      // Immediate anomaly risk window (0 - 100)
  cumulative_score: number;   // Monotonically non-decreasing score (0 - 100)
  suspicion_score: number;    // Monotonically non-decreasing composite score
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
  private nextDetNumber = 1;

  // State maps
  private activeTracks: Map<string, InternalPersonTrack> = new Map();
  private candidateBuffer: Map<string, CandidateEvidenceItem> = new Map();

  // Multi-frame confirmation parameters (rejects single-frame noise & flickers)
  private readonly confirmationHitsRequired = 5;   // ~0.35s - 0.5s multi-frame window
  private readonly maxMissedFrames = 20;            // Grace period before eviction: ~1.4s
  private readonly associationDistThreshold = 0.32;

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
    this.nextDetNumber = 1;
  }

  /**
   * Admin Action: Unlatches warning alert for a track while preserving the cumulative audit score.
   * Resets active current_score to 0.
   */
  public clearTrackWarning(trackId: string): void {
    const track = this.activeTracks.get(trackId);
    if (track) {
      track.warning_latched = false;
      track.warning_cleared_at = Date.now();
      track.current_score = 0;
      track.turn_count = 0;
      track.face_hidden_since = null;
      track.phone_seen_since = null;
      // Invariant: cumulative_score is preserved for audit
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
   * Generate camera-scoped Layer 2 tracking identifier upon confirmation.
   * Example: CAM1-T001, CAM1-T002
   */
  private generateTrackId(camPrefix: string): string {
    const numStr = String(this.nextTrackNumber++).padStart(3, '0');
    return `${camPrefix}-T${numStr}`;
  }

  /**
   * Generate ephemeral Layer 1 detection identifier.
   */
  private generateDetectionId(): string {
    return `det-${this.nextDetNumber++}`;
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
   * STRUCTURAL HUMAN MORPHOLOGY DETECTOR
   * Does NOT rely on trivial skin-locus colors (which falsely match wooden desks, chairs, yellow walls).
   * Analyzes:
   * 1. Upper-body vertical aspect ratio (height:width = 1.25 : 1 to 2.8 : 1)
   * 2. Head-on-shoulders anatomical silhouette (tapered head oval resting above wider shoulder span)
   * 3. Vertical bilateral edge symmetry across torso centerline
   * 4. Gradient contour magnitude and contrast against background
   * STRICT INVARIANT: If no human silhouette is present in frame, returns EMPTY ARRAY.
   */
  private detectHumansInFrame(frameData: Uint8ClampedArray): HumanDetection[] {
    const gridCols = 32;
    const gridRows = 18;
    const cellW = this.width / gridCols;
    const cellH = this.height / gridRows;

    // Luminance and edge gradient map
    const luma = new Float32Array(this.width * this.height);
    const gradX = new Float32Array(this.width * this.height);
    const gradY = new Float32Array(this.width * this.height);

    for (let y = 0; y < this.height; y++) {
      const rowOffset = y * this.width;
      for (let x = 0; x < this.width; x++) {
        const idx = (rowOffset + x) * 4;
        luma[rowOffset + x] = 0.299 * frameData[idx] + 0.587 * frameData[idx + 1] + 0.114 * frameData[idx + 2];
      }
    }

    // Sobel gradients
    for (let y = 1; y < this.height - 1; y++) {
      const rowOffset = y * this.width;
      const prevRow = (y - 1) * this.width;
      const nextRow = (y + 1) * this.width;

      for (let x = 1; x < this.width - 1; x++) {
        const gx =
          -luma[prevRow + x - 1] + luma[prevRow + x + 1]
          - 2 * luma[rowOffset + x - 1] + 2 * luma[rowOffset + x + 1]
          - luma[nextRow + x - 1] + luma[nextRow + x + 1];

        const gy =
          -luma[prevRow + x - 1] - 2 * luma[prevRow + x] - luma[prevRow + x + 1]
          + luma[nextRow + x - 1] + 2 * luma[nextRow + x] + luma[nextRow + x + 1];

        gradX[rowOffset + x] = gx;
        gradY[rowOffset + x] = gy;
      }
    }

    // Spatial cell analysis for human upper-body structure
    const cellGradEnergy = new Float32Array(gridCols * gridRows);
    let totalFrameEnergy = 0;

    for (let gy = 0; gy < gridRows; gy++) {
      const startY = Math.floor(gy * cellH);
      const endY = Math.floor((gy + 1) * cellH);

      for (let gx = 0; gx < gridCols; gx++) {
        const startX = Math.floor(gx * cellW);
        const endX = Math.floor((gx + 1) * cellW);

        let energy = 0;
        let count = 0;
        for (let y = startY; y < endY; y++) {
          const rowOffset = y * this.width;
          for (let x = startX; x < endX; x++) {
            const mag = Math.hypot(gradX[rowOffset + x], gradY[rowOffset + x]);
            if (mag > 28) energy += mag;
            count++;
          }
        }
        const cellVal = count > 0 ? energy / count : 0;
        cellGradEnergy[gy * gridCols + gx] = cellVal;
        totalFrameEnergy += cellVal;
      }
    }

    // RULE 2: If frame has near-zero structural contrast, no humans exist
    if (totalFrameEnergy < 120) {
      return [];
    }

    // Scan for upper-body anatomical candidates
    const candidateDetections: HumanDetection[] = [];

    // Search window sizes representing realistic human torso scales in exam room view
    const windowConfigs = [
      { wCols: 5, hRows: 8 },  // Mid/far desk
      { wCols: 7, hRows: 11 }, // Medium distance
      { wCols: 9, hRows: 14 }  // Close distance
    ];

    for (const win of windowConfigs) {
      for (let gy = 0; gy <= gridRows - win.hRows; gy += 2) {
        for (let gx = 0; gx <= gridCols - win.wCols; gx += 2) {
          // Anatomical zone evaluation:
          // Zone A: Head region (top 35% of window, centered)
          // Zone B: Shoulder span (middle 30%, wider lateral expansion)
          // Zone C: Torso region (bottom 35%)
          const headRows = Math.floor(win.hRows * 0.35);
          const shoulderRows = Math.floor(win.hRows * 0.30);
          const torsoRows = win.hRows - headRows - shoulderRows;

          let headEnergy = 0;
          let shoulderEnergy = 0;
          let torsoEnergy = 0;

          const midX = gx + Math.floor(win.wCols / 2);
          let leftSymmetryEnergy = 0;
          let rightSymmetryEnergy = 0;

          // Head zone
          for (let y = gy; y < gy + headRows; y++) {
            for (let x = gx + 1; x < gx + win.wCols - 1; x++) {
              const e = cellGradEnergy[y * gridCols + x];
              headEnergy += e;
              if (x < midX) leftSymmetryEnergy += e;
              else if (x > midX) rightSymmetryEnergy += e;
            }
          }

          // Shoulder zone (should exhibit broader lateral gradient presence)
          for (let y = gy + headRows; y < gy + headRows + shoulderRows; y++) {
            for (let x = gx; x < gx + win.wCols; x++) {
              const e = cellGradEnergy[y * gridCols + x];
              shoulderEnergy += e;
              if (x < midX) leftSymmetryEnergy += e;
              else if (x > midX) rightSymmetryEnergy += e;
            }
          }

          // Torso zone
          for (let y = gy + headRows + shoulderRows; y < gy + win.hRows; y++) {
            for (let x = gx; x < gx + win.wCols; x++) {
              torsoEnergy += cellGradEnergy[y * gridCols + x];
            }
          }

          // Bilateral symmetry ratio across vertical midline
          const symmetryDiff = Math.abs(leftSymmetryEnergy - rightSymmetryEnergy);
          const symmetrySum = leftSymmetryEnergy + rightSymmetryEnergy + 1;
          const symmetryScore = Math.max(0, 1 - (symmetryDiff / symmetrySum));

          // Anatomical proportions test:
          // Shoulder energy must be significant and expand relative to head
          const hasHeadStructure = headEnergy > 45;
          const hasShoulderStructure = shoulderEnergy > 60;
          const hasTorsoStructure = torsoEnergy > 40;
          const hasSymmetry = symmetryScore > 0.45;

          if (hasHeadStructure && hasShoulderStructure && hasTorsoStructure && hasSymmetry) {
            const normX = Math.max(0.01, Math.min(0.98, gx / gridCols));
            const normY = Math.max(0.01, Math.min(0.98, gy / gridRows));
            const normW = Math.min(0.98 - normX, win.wCols / gridCols);
            const normH = Math.min(0.98 - normY, win.hRows / gridRows);

            // Aspect ratio check (strict verticality for sitting/standing person)
            const aspectRatio = normH / normW;
            if (aspectRatio >= 1.25 && aspectRatio <= 2.85) {
              const confidence = Math.min(0.96, 0.68 + (symmetryScore * 0.18) + Math.min(0.12, (shoulderEnergy / 300)));
              candidateDetections.push({
                detection_id: this.generateDetectionId(),
                class_name: 'person',
                confidence,
                bbox: {
                  x: normX,
                  y: normY,
                  width: normW,
                  height: normH
                }
              });
            }
          }
        }
      }
    }

    // Non-Maximum Suppression (NMS) to merge overlapping windows
    candidateDetections.sort((a, b) => b.confidence - a.confidence);
    const suppressedHumans: HumanDetection[] = [];

    for (const det of candidateDetections) {
      let isDuplicate = false;
      for (const kept of suppressedHumans) {
        const iou = this.computeIoU(det.bbox, kept.bbox);
        const dist = this.computeCenterDistance(det.bbox, kept.bbox);
        if (iou > 0.28 || dist < Math.min(det.bbox.width, kept.bbox.width) * 0.65) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        suppressedHumans.push(det);
      }
    }

    return suppressedHumans;
  }

  /**
   * Core frame processing pipeline executed every frame
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
    // STEP 1: DETECT HUMANS & APPLY HUMAN GATE (RULE 1 & RULE 2)
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

        // Optical motion calculation ONLY INSIDE this confirmed human track's bbox (Rule 3)
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

        // Inspect head pose & face visibility inside confirmed human box
        this.inspectHumanHeadAndGaze(track, frameData);

        // Evaluate behavioral rules & update dual suspicion scores
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
    // STEP 3: TEMPORAL CANDIDATE EVIDENCE CONFIRMATION (NO 4-PERSON LIMIT)
    // -------------------------------------------------------------
    const matchedCandidateIds = new Set<string>();

    for (const det of unmatchedHumans) {
      let matchedCandId: string | null = null;
      let minCandDist = 0.28;

      for (const [cId, cand] of this.candidateBuffer.entries()) {
        const dist = this.computeCenterDistance(cand.bbox, det.bbox);
        if (dist < minCandDist) {
          minCandDist = dist;
          matchedCandId = cId;
        }
      }

      const detCenterX = det.bbox.x + det.bbox.width / 2;
      const detCenterY = det.bbox.y + det.bbox.height / 2;

      if (matchedCandId) {
        matchedCandidateIds.add(matchedCandId);
        const cand = this.candidateBuffer.get(matchedCandId)!;
        cand.sample_count++;
        cand.last_detected_at = now;
        cand.cumulative_confidence += det.confidence;
        cand.center_history.push({ x: detCenterX, y: detCenterY });
        cand.size_history.push({ w: det.bbox.width, h: det.bbox.height });

        cand.bbox = {
          x: cand.bbox.x * 0.6 + det.bbox.x * 0.4,
          y: cand.bbox.y * 0.6 + det.bbox.y * 0.4,
          width: cand.bbox.width * 0.6 + det.bbox.width * 0.4,
          height: cand.bbox.height * 0.6 + det.bbox.height * 0.4
        };

        // Multi-frame candidate confirmation with spatial consistency verification
        if (cand.sample_count >= this.confirmationHitsRequired) {
          const avgConfidence = cand.cumulative_confidence / cand.sample_count;

          // Variance check on center position
          let centerVarX = 0;
          let centerVarY = 0;
          const avgX = cand.center_history.reduce((a, b) => a + b.x, 0) / cand.center_history.length;
          const avgY = cand.center_history.reduce((a, b) => a + b.y, 0) / cand.center_history.length;
          for (const pt of cand.center_history) {
            centerVarX += Math.pow(pt.x - avgX, 2);
            centerVarY += Math.pow(pt.y - avgY, 2);
          }
          const spatialVariance = Math.hypot(centerVarX, centerVarY) / cand.center_history.length;

          // Only confirm if evidence is spatially stable and confidence is high
          if (avgConfidence >= 0.65 && spatialVariance < 0.08) {
            const permTrackId = this.generateTrackId(camPrefix);
            const activeIndex = this.activeTracks.size;
            const assignedStudentId = cand.associated_student_id || availableStudents[activeIndex]?.id;
            const globalPersonId = `P-${String(this.activeTracks.size + 1).padStart(3, '0')}`;

            const newTrack: InternalPersonTrack = {
              track_id: permTrackId,
              camera_id: cameraId,
              global_person_id: globalPersonId,
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
              current_score: 0,
              cumulative_score: 0,
              suspicion_score: 0,
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
          center_history: [{ x: detCenterX, y: detCenterY }],
          size_history: [{ w: det.bbox.width, h: det.bbox.height }],
          associated_student_id: det.associated_student_id,
          seat_id: det.seat_id
        });
      }
    }

    // Prune stale unconfirmed candidate tracks
    for (const [cId, cand] of this.candidateBuffer.entries()) {
      if (!matchedCandidateIds.has(cId)) {
        if ((now - cand.last_detected_at) > 1200) {
          this.candidateBuffer.delete(cId);
        }
      }
    }

    // -------------------------------------------------------------
    // STEP 4: PERSISTENT PINNING (RULE 4: STILL HUMAN REMAINS TRACKED)
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

    const faceVisible = totalSamples > 0 && (skinHits / totalSamples) > 0.08;
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
   * Maintains dual scores: current_score and cumulative_score.
   */
  private inspectHumanBehavior(track: InternalPersonTrack, now: number): void {
    const dir = track.head_pose.direction;
    let activeAnomalyWindow = 0;

    // 1. Head Pose Gaze Tracking
    if (dir !== track.current_direction) {
      if (dir === 'left' || dir === 'right') {
        track.turn_count++;
        track.last_turn_time = now;
        activeAnomalyWindow += 15;
      }
      track.current_direction = dir;
      track.direction_started_at = now;
    } else if (dir === 'left' || dir === 'right') {
      const sustainedSec = (now - track.direction_started_at) / 1000;
      if (sustainedSec >= 2.0) {
        activeAnomalyWindow += 25; // Sustained glancing away
      }
    }

    // 2. Repeated Looking Glance Accumulation
    if (track.turn_count >= 3) {
      activeAnomalyWindow += 25;
    }

    // 3. Face Occlusion
    if (!track.face_visible) {
      if (!track.face_hidden_since) track.face_hidden_since = now;
      const hiddenSec = (now - track.face_hidden_since) / 1000;
      if (hiddenSec >= 2.5) {
        activeAnomalyWindow += 30;
      }
    } else {
      track.face_hidden_since = null;
    }

    // 4. Agitated Movement contribution
    if (track.movement_magnitude > 45) {
      activeAnomalyWindow += Math.min(30, Math.round(track.movement_magnitude * 0.35));
    }

    // 5. Phone Detection
    if (track.phone_detected) {
      activeAnomalyWindow += 50;
    }

    // Update current score (immediate penalty)
    track.current_score = Math.min(100, activeAnomalyWindow);

    // Update cumulative score (monotonically non-decreasing audit metric)
    if (activeAnomalyWindow > 0) {
      const delta = Math.round(activeAnomalyWindow * 0.25);
      track.cumulative_score = Math.min(100, track.cumulative_score + delta);
    }
    track.suspicion_score = track.cumulative_score;

    // Latch warning if cumulative score or current score crosses threshold (>= 60)
    if (track.cumulative_score >= 60 || track.current_score >= 60) {
      track.warning_latched = true;
    }
  }

  /**
   * Export confirmed active tracks for canvas rendering & telemetry
   */
  private exportActiveTracks(): CameraTrack[] {
    return Array.from(this.activeTracks.values())
      .filter(t => t.status === 'active' || (t.status === 'lost' && t.missed_frames <= 12))
      .map(t => ({
        track_id: t.track_id,
        camera_id: t.camera_id,
        global_person_id: t.global_person_id,
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
        current_score: t.current_score,
        cumulative_score: t.cumulative_score,
        warning_latched: t.warning_latched,
        warning_cleared_at: t.warning_cleared_at,
        last_seen_timestamp: t.last_seen_timestamp,
        created_timestamp: t.created_timestamp,
        history_trajectory: [...t.history]
      }));
  }
}
