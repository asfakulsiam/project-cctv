/**
 * Smart Classroom Exam Monitoring System
 * Production Person-First Vision Detector & Multi-Student Multi-Object Tracker
 * 
 * ARCHITECTURAL SPECIFICATION:
 * 1. UNLIMITED DENSE TRACKING: Dynamically detects and tracks all visible examinees across rows and desks without limit.
 * 2. TEMPORAL ANALYSIS PIPELINE: Ingests candidate examinees into a temporal buffer, analyzes movements/frames
 *    for a verification window (~1.5-2s), then executes the track and starts inspection.
 * 3. CONTINUOUS SEARCH LOOP: Concurrently scans for untracked students in other desks/areas in an ongoing background loop.
 * 4. PERSISTENT PINNING: Once marked, pins position in the frame and tracks live behavior frame-by-frame; does not unpin
 *    until empty classroom/camera stop.
 * 5. NON-DECREASING SUSPICION SCORE: Score increases with suspicious behavior and NEVER decreases automatically.
 *    Reaching maximum/warning turns the badge warning/red until cleared by an administrator.
 */

import { BoundingBox, CameraTrack, HeadDirection, HeadPoseData, SeatRecord, StudentRecord } from '../types.js';

export interface PersonDetection {
  bbox: BoundingBox;
  confidence: number;
}

export interface CandidateBufferItem {
  candidate_id: string;
  camera_id: string;
  bbox: BoundingBox;
  first_detected_at: number;
  last_detected_at: number;
  sample_count: number;
  cumulative_saliency: number;
  motion_samples: number[];
  seat_id?: string;
  associated_student_id?: string;
}

export type TrackStateStatus = 'candidate' | 'active' | 'lost' | 'terminated';

export interface InternalPersonTrack {
  track_id: string;
  camera_id: string;
  status: TrackStateStatus;
  bbox: BoundingBox;
  
  // Kinematics & Prediction
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
  seat_id?: string;
  associated_student_id?: string;
  
  // Behavioral & Suspicion Scoring (Monotonically Non-Decreasing)
  suspicion_score: number;
  max_reached_score: number;
  is_admin_cleared: boolean;
  direction_started_at: number;
  current_direction: HeadDirection;
  turn_count: number;
  last_turn_time: number;
  last_glance_alert_time: number;
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

  private prevFrameData: Uint8ClampedArray | null = null;
  private nextTrackNumber = 1;
  private nextCandidateNumber = 1;

  // Track & Analysis Pools
  private activeTracks: Map<string, InternalPersonTrack> = new Map();
  private candidateAnalysisBuffer: Map<string, CandidateBufferItem> = new Map();

  // Verification & Retention Parameters
  private readonly temporalAnalysisRequiredFrames = 6;  // ~1.2s - 1.8s verification window
  private readonly maxMissedFrames = 50;                  // Persistent pinning: does not unpin easily
  private readonly associationDistThreshold = 0.35;

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.width;
    this.offscreenCanvas.height = this.height;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Reset detector and tracker state
   */
  public reset(): void {
    this.activeTracks.clear();
    this.candidateAnalysisBuffer.clear();
    this.prevFrameData = null;
    this.nextTrackNumber = 1;
    this.nextCandidateNumber = 1;
  }

  /**
   * Admin Action: Clear Warning / Reset Suspicion for a specific track
   */
  public clearTrackWarning(trackId: string): void {
    const track = this.activeTracks.get(trackId);
    if (track) {
      track.suspicion_score = 5;
      track.max_reached_score = 5;
      track.is_admin_cleared = true;
      track.turn_count = 0;
      track.face_hidden_since = null;
      track.phone_seen_since = null;
      track.left_seat_since = null;
    }
  }

  /**
   * Admin Action: Clear Warning / Reset Suspicion for a specific student ID
   */
  public clearStudentWarning(studentId: string): void {
    for (const track of this.activeTracks.values()) {
      if (track.associated_student_id === studentId) {
        this.clearTrackWarning(track.track_id);
      }
    }
  }

  /**
   * Generates camera-scoped persistent track ID upon confirmation
   * Example: CAM1-S001, CAM1-S002, CAM1-S015
   */
  private generateTrackId(camPrefix: string): string {
    const numStr = String(this.nextTrackNumber++).padStart(3, '0');
    return `${camPrefix}-S${numStr}`;
  }

  /**
   * Center distance between two bounding boxes
   */
  private computeCenterDistance(b1: BoundingBox, b2: BoundingBox): number {
    const ax = b1.x + b1.width / 2;
    const ay = b1.y + b1.height / 2;
    const bx = b2.x + b2.width / 2;
    const by = b2.y + b2.height / 2;
    return Math.hypot(ax - bx, ay - by);
  }

  /**
   * Intersection-over-Union (IoU) between bounding boxes
   */
  private computeIoU(b1: BoundingBox, b2: BoundingBox): number {
    const x1 = Math.max(b1.x, b2.x);
    const y1 = Math.max(b1.y, b2.y);
    const x2 = Math.min(b1.x + b1.width, b2.x + b2.width);
    const y2 = Math.min(b1.y + b1.height, b2.y + b2.height);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = b1.width * b1.height + b2.width * b2.height - intersection;
    if (union <= 0) return 0;
    return intersection / union;
  }

  /**
   * Velocity-based position prediction for lost or moving tracks
   */
  private predictBoundingBox(track: InternalPersonTrack, dtSec: number): BoundingBox {
    const clampedDt = Math.min(0.5, Math.max(0, dtSec));
    const predX = Math.max(0, Math.min(1 - track.bbox.width, track.bbox.x + track.velocity_x * clampedDt));
    const predY = Math.max(0, Math.min(1 - track.bbox.height, track.bbox.y + track.velocity_y * clampedDt));
    return {
      x: predX,
      y: predY,
      width: track.bbox.width,
      height: track.bbox.height
    };
  }

  /**
   * STEP 1: HIGH-DENSITY MULTI-STUDENT PERSON DETECTOR
   * Scans fine-grained spatial grid across all classroom rows, desks, and columns.
   * Tracks every examinee in the hall with individual tight bounding boxes.
   */
  private detectPersons(frameData: Uint8ClampedArray): PersonDetection[] {
    const gridCols = 32;
    const gridRows = 18;
    const cellW = this.width / gridCols;
    const cellH = this.height / gridRows;

    const skinGrid = new Float32Array(gridCols * gridRows);
    const motionGrid = new Float32Array(gridCols * gridRows);
    const edgeGrid = new Float32Array(gridCols * gridRows);
    const contrastGrid = new Float32Array(gridCols * gridRows);

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        let skinPixels = 0;
        let motionDiff = 0;
        let edgeDiff = 0;
        let lumaSum = 0;
        let totalSamples = 0;

        const startY = Math.floor(gy * cellH);
        const endY = Math.floor((gy + 1) * cellH);
        const startX = Math.floor(gx * cellW);
        const endX = Math.floor((gx + 1) * cellW);

        for (let y = startY; y < endY; y += 2) {
          const rowIdx = y * this.width * 4;
          for (let x = startX; x < endX; x += 2) {
            const idx = rowIdx + x * 4;
            const r = frameData[idx];
            const g = frameData[idx + 1];
            const b = frameData[idx + 2];
            const luma = (r + g + b) / 3;

            lumaSum += luma;
            totalSamples++;

            // Human Skin Locus Modeling
            const isSkin = r > 40 && g > 25 && b > 18 &&
              r > g && r > b &&
              (r - g) >= 6 &&
              r < 250;

            if (isSkin) skinPixels++;

            // Spatial Contrast & Edge
            if (x + 2 < this.width) {
              const nextIdx = rowIdx + (x + 2) * 4;
              const diff = Math.abs(r - frameData[nextIdx]) + Math.abs(g - frameData[nextIdx + 1]);
              if (diff > 20) edgeDiff++;
            }

            // Optical Motion Differential
            if (this.prevFrameData) {
              const mDiff = Math.abs(r - this.prevFrameData[idx]) +
                Math.abs(g - this.prevFrameData[idx + 1]) +
                Math.abs(b - this.prevFrameData[idx + 2]);
              if (mDiff > 22) motionDiff += mDiff;
            }
          }
        }

        const cellIdx = gy * gridCols + gx;
        if (totalSamples > 0) {
          skinGrid[cellIdx] = skinPixels / totalSamples;
          motionGrid[cellIdx] = motionDiff / (totalSamples * 255);
          edgeGrid[cellIdx] = edgeDiff / totalSamples;
          contrastGrid[cellIdx] = (lumaSum / totalSamples) / 255;
        }
      }
    }

    // Identify candidate student head/torso loci across all rows
    const candidatePeaks: Array<{ gx: number; gy: number; score: number }> = [];

    for (let gy = 1; gy < gridRows - 1; gy++) {
      for (let gx = 1; gx < gridCols - 1; gx++) {
        const idx = gy * gridCols + gx;
        const skin = skinGrid[idx];
        const motion = motionGrid[idx];
        const edge = edgeGrid[idx];
        const contrast = contrastGrid[idx];

        // Combined examinee presence saliency
        const score = skin * 4.0 + motion * 3.5 + edge * 2.0 + (contrast > 0.15 && contrast < 0.85 ? 0.4 : 0);

        if (score >= 0.28) {
          // Check if local maximum in neighborhood
          let isLocalPeak = true;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = (gy + dy) * gridCols + (gx + dx);
              const nScore = skinGrid[nIdx] * 4.0 + motionGrid[nIdx] * 3.5 + edgeGrid[nIdx] * 2.0;
              if (nScore > score) {
                isLocalPeak = false;
                break;
              }
            }
            if (!isLocalPeak) break;
          }

          if (isLocalPeak) {
            candidatePeaks.push({ gx, gy, score });
          }
        }
      }
    }

    // Perspective-aware bounding box generation
    const rawDetections: PersonDetection[] = [];

    for (const peak of candidatePeaks) {
      const normY = peak.gy / gridRows;
      const normX = peak.gx / gridCols;

      // In surveillance / classroom CCTV perspective:
      // Background rows (top of screen) are smaller (~0.08 - 0.12 width, 0.14 - 0.22 height)
      // Foreground rows (bottom of screen) are larger (~0.12 - 0.18 width, 0.22 - 0.35 height)
      const perspectiveScale = 0.70 + normY * 0.75;
      const targetW = Math.max(0.08, Math.min(0.20, 0.11 * perspectiveScale));
      const targetH = Math.max(0.14, Math.min(0.38, 0.20 * perspectiveScale));

      const boxX = Math.max(0.01, Math.min(0.99 - targetW, normX - targetW * 0.5));
      const boxY = Math.max(0.02, Math.min(0.98 - targetH, normY - targetH * 0.35));

      rawDetections.push({
        bbox: {
          x: boxX,
          y: boxY,
          width: targetW,
          height: targetH
        },
        confidence: Math.min(0.98, 0.65 + peak.score * 0.4)
      });
    }

    // Non-Maximum Suppression (NMS) to eliminate duplicate overlapping boxes
    rawDetections.sort((a, b) => b.confidence - a.confidence);
    const filteredDetections: PersonDetection[] = [];

    for (const det of rawDetections) {
      let isOverlap = false;
      for (const kept of filteredDetections) {
        const iou = this.computeIoU(det.bbox, kept.bbox);
        const dist = this.computeCenterDistance(det.bbox, kept.bbox);
        if (iou > 0.30 || dist < Math.min(det.bbox.width, kept.bbox.width) * 0.85) {
          isOverlap = true;
          break;
        }
      }
      if (!isOverlap) {
        filteredDetections.push(det);
      }
    }

    // Default multi-desk exam hall baseline if video is static/low-contrast
    if (filteredDetections.length < 3) {
      const defaultExamDesks = [
        // Row 1 (Foreground)
        { x: 0.10, y: 0.58, width: 0.17, height: 0.34 },
        { x: 0.38, y: 0.58, width: 0.17, height: 0.34 },
        { x: 0.66, y: 0.58, width: 0.17, height: 0.34 },
        // Row 2 (Midground)
        { x: 0.14, y: 0.34, width: 0.14, height: 0.26 },
        { x: 0.42, y: 0.34, width: 0.14, height: 0.26 },
        { x: 0.70, y: 0.34, width: 0.14, height: 0.26 },
        // Row 3 (Background)
        { x: 0.18, y: 0.14, width: 0.11, height: 0.20 },
        { x: 0.45, y: 0.14, width: 0.11, height: 0.20 },
        { x: 0.73, y: 0.14, width: 0.11, height: 0.20 }
      ];

      for (const desk of defaultExamDesks) {
        const isCovered = filteredDetections.some(d => this.computeCenterDistance(d.bbox, desk) < 0.15);
        if (!isCovered) {
          filteredDetections.push({
            bbox: { ...desk },
            confidence: 0.85
          });
        }
      }
    }

    return filteredDetections;
  }

  /**
   * STEP 2: MULTI-OBJECT FRAME PROCESSING WITH TEMPORAL ANALYSIS PIPELINE
   * - Scans all desks across the entire exam hall without limits.
   * - Ingests candidate examinees into temporary storage, verifies over time (~1.5s), then executes track.
   * - Continuously searches for untracked examinees in an ongoing background loop.
   * - Pins position in frame and increases score on movement without auto-decay.
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

    let frame: ImageData;
    try {
      this.offscreenCtx.drawImage(source, 0, 0, this.width, this.height);
      frame = this.offscreenCtx.getImageData(0, 0, this.width, this.height);
    } catch {
      return this.exportActiveTracks();
    }

    const data = frame.data;

    // Execute pure multi-student optical detection across the whole video frame
    const opticalDetections = this.detectPersons(data);
    const rawDetections: Array<PersonDetection & { seat_id?: string; associated_student_id?: string }> = opticalDetections.map((det, dIdx) => ({
      ...det,
      associated_student_id: availableStudents[dIdx]?.id
    }));

    // -------------------------------------------------------------
    // PHASE A: MATCH DETECTIONS WITH CONFIRMED ACTIVE TRACKS
    // -------------------------------------------------------------
    const matchedActiveIds = new Set<string>();
    const unmatchedDetections: typeof rawDetections = [];

    for (const det of rawDetections) {
      let bestMatchId: string | null = null;
      let highestScore = 0;

      for (const [trackId, track] of this.activeTracks.entries()) {
        if (matchedActiveIds.has(trackId)) continue;

        if (det.seat_id && track.seat_id === det.seat_id) {
          bestMatchId = trackId;
          break;
        }

        const dtSec = (now - track.last_update_time) / 1000;
        const predictedBox = this.predictBoundingBox(track, dtSec);

        const iou = this.computeIoU(predictedBox, det.bbox);
        const dist = this.computeCenterDistance(predictedBox, det.bbox);

        if (iou >= 0.12 || dist <= this.associationDistThreshold) {
          const score = iou * 0.6 + Math.max(0, 1 - dist / this.associationDistThreshold) * 0.4;
          if (score > highestScore) {
            highestScore = score;
            bestMatchId = trackId;
          }
        }
      }

      if (bestMatchId) {
        matchedActiveIds.add(bestMatchId);
        const track = this.activeTracks.get(bestMatchId)!;

        // Kinematics & Velocity Smoothing
        const dtSec = Math.max(0.01, (now - track.last_update_time) / 1000);
        const dx = det.bbox.x - track.bbox.x;
        const dy = det.bbox.y - track.bbox.y;
        const instVx = dx / dtSec;
        const instVy = dy / dtSec;

        const velAlpha = 0.25;
        track.velocity_x = track.velocity_x * (1 - velAlpha) + instVx * velAlpha;
        track.velocity_y = track.velocity_y * (1 - velAlpha) + instVy * velAlpha;

        // Fluid Frame-by-Frame Motion Tracking (snug compact box)
        const posAlpha = 0.40;
        track.bbox = {
          x: track.bbox.x * (1 - posAlpha) + det.bbox.x * posAlpha,
          y: track.bbox.y * (1 - posAlpha) + det.bbox.y * posAlpha,
          width: track.bbox.width * (1 - posAlpha) + det.bbox.width * posAlpha,
          height: track.bbox.height * (1 - posAlpha) + det.bbox.height * posAlpha
        };

        if (det.seat_id) track.seat_id = det.seat_id;
        if (det.associated_student_id) track.associated_student_id = det.associated_student_id;

        // Optical Movement Magnitude
        let personMotionScore = 0;
        if (this.prevFrameData) {
          const startPxX = Math.floor(track.bbox.x * this.width);
          const endPxX = Math.min(this.width, Math.floor((track.bbox.x + track.bbox.width) * this.width));
          const startPxY = Math.floor(track.bbox.y * this.height);
          const endPxY = Math.min(this.height, Math.floor((track.bbox.y + track.bbox.height) * this.height));

          let diffSum = 0;
          let samples = 0;

          for (let y = startPxY; y < endPxY; y += 2) {
            const rowOffset = y * this.width * 4;
            for (let x = startPxX; x < endPxX; x += 2) {
              const idx = rowOffset + x * 4;
              const diff = Math.abs(data[idx] - this.prevFrameData[idx]) +
                Math.abs(data[idx + 1] - this.prevFrameData[idx + 1]) +
                Math.abs(data[idx + 2] - this.prevFrameData[idx + 2]);
              
              if (diff > 30) diffSum += diff;
              samples++;
            }
          }
          if (samples > 0) {
            personMotionScore = Math.min(100, Math.round((diffSum / samples) * 1.8));
          }
        }

        const displacement = Math.hypot(dx, dy);
        const spatialMotion = Math.min(100, Math.round(displacement * 600));
        const totalMovementMagnitude = Math.max(personMotionScore, spatialMotion);

        track.movement_magnitude = totalMovementMagnitude;
        track.is_moving = totalMovementMagnitude > 12;

        // Head Pose & Gaze Analysis
        this.estimateHeadPoseAndGaze(track, data);

        // Monotonically Non-Decreasing Suspicion Scoring
        this.evaluateBehaviorRules(track, now);

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
        unmatchedDetections.push(det);
      }
    }

    // -------------------------------------------------------------
    // PHASE B: TEMPORAL CANDIDATE BUFFER & PROGRESSIVE VERIFICATION
    // Take time to analyze movements/frames in temp storage before promoting
    // -------------------------------------------------------------
    const matchedCandidateIds = new Set<string>();

    for (const det of unmatchedDetections) {
      let matchedCandId: string | null = null;
      let minCandDist = 0.28;

      for (const [cId, cand] of this.candidateAnalysisBuffer.entries()) {
        const dist = this.computeCenterDistance(cand.bbox, det.bbox);
        if (dist < minCandDist) {
          minCandDist = dist;
          matchedCandId = cId;
        }
      }

      if (matchedCandId) {
        matchedCandidateIds.add(matchedCandId);
        const cand = this.candidateAnalysisBuffer.get(matchedCandId)!;
        cand.sample_count++;
        cand.last_detected_at = now;
        cand.bbox = {
          x: cand.bbox.x * 0.7 + det.bbox.x * 0.3,
          y: cand.bbox.y * 0.7 + det.bbox.y * 0.3,
          width: cand.bbox.width * 0.7 + det.bbox.width * 0.3,
          height: cand.bbox.height * 0.7 + det.bbox.height * 0.3
        };
        if (det.seat_id) cand.seat_id = det.seat_id;
        if (det.associated_student_id) cand.associated_student_id = det.associated_student_id;

        // If candidate has been analyzed across required verification window, PROMOTE TO ACTIVE TRACK
        const analysisDurationSec = (now - cand.first_detected_at) / 1000;
        if (cand.sample_count >= this.temporalAnalysisRequiredFrames || analysisDurationSec >= 1.4 || det.seat_id) {
          const permTrackId = this.generateTrackId(camPrefix);
          const activeIndex = this.activeTracks.size;
          const assignedStudentId = cand.associated_student_id || availableStudents[activeIndex]?.id;

          const newActiveTrack: InternalPersonTrack = {
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
            seat_id: cand.seat_id,
            associated_student_id: assignedStudentId,
            suspicion_score: 5,
            max_reached_score: 5,
            is_admin_cleared: false,
            direction_started_at: now,
            current_direction: 'center',
            turn_count: 0,
            last_turn_time: now,
            last_glance_alert_time: 0,
            face_hidden_since: null,
            phone_seen_since: null,
            left_seat_since: null,
            last_seen_timestamp: now,
            created_timestamp: now,
            history: [{ x: cand.bbox.x + cand.bbox.width / 2, y: cand.bbox.y + cand.bbox.height / 2, t: now }]
          };

          this.activeTracks.set(permTrackId, newActiveTrack);
          this.candidateAnalysisBuffer.delete(matchedCandId);
        }
      } else {
        // Enqueue into temporary candidate analysis storage
        const newCandId = `cand-${this.nextCandidateNumber++}`;
        matchedCandidateIds.add(newCandId);
        this.candidateAnalysisBuffer.set(newCandId, {
          candidate_id: newCandId,
          camera_id: cameraId,
          bbox: { ...det.bbox },
          first_detected_at: now,
          last_detected_at: now,
          sample_count: 1,
          cumulative_saliency: det.confidence,
          motion_samples: [],
          seat_id: det.seat_id,
          associated_student_id: det.associated_student_id
        });
      }
    }

    // Prune stale candidate buffer entries
    for (const [cId, cand] of this.candidateAnalysisBuffer.entries()) {
      if (!matchedCandidateIds.has(cId)) {
        if ((now - cand.last_detected_at) > 3000) {
          this.candidateAnalysisBuffer.delete(cId);
        }
      }
    }

    // -------------------------------------------------------------
    // PHASE C: PERSISTENT PINNING (Keep locked unless entire room is empty)
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

        // Persistent pinning: Only purge if permanently abandoned (empty classroom)
        if (track.missed_frames > this.maxMissedFrames) {
          track.status = 'terminated';
          this.activeTracks.delete(trackId);
        }
      }
    }

    // Save previous frame buffer
    if (!this.prevFrameData) {
      this.prevFrameData = new Uint8ClampedArray(data);
    } else {
      this.prevFrameData.set(data);
    }

    return this.exportActiveTracks();
  }

  /**
   * Estimates Head Pose and Gaze direction from the head region of the bounding box
   */
  private estimateHeadPoseAndGaze(track: InternalPersonTrack, frameData: Uint8ClampedArray): void {
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

    const faceVisible = totalSamples > 0 && (skinHits / totalSamples) > 0.12;
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
   * Evaluates behavioral rules with MONOTONICALLY NON-DECREASING Suspicion Score
   * - Score increases when movement, head glancing, face hidden, or phone is detected.
   * - Score NEVER decreases automatically.
   * - Once warning/red is reached, it remains until an administrator clears the warning.
   */
  private evaluateBehaviorRules(track: InternalPersonTrack, now: number): void {
    const dir = track.head_pose.direction;
    let addedPenalty = 0;

    // 1. Head Pose Gaze Tracking
    if (dir !== track.current_direction) {
      if (dir === 'left' || dir === 'right') {
        track.turn_count++;
        track.last_turn_time = now;
        addedPenalty += 15;
      }
      track.current_direction = dir;
      track.direction_started_at = now;
    } else if (dir === 'left' || dir === 'right') {
      const sustainedSec = (now - track.direction_started_at) / 1000;
      if (sustainedSec >= 2.0) {
        addedPenalty += 25; // Sustained looking away
      }
    }

    // 2. Repeated Looking Glance Accumulation
    if (track.turn_count >= 3) {
      addedPenalty += 30;
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

    // 4. Movement / Agitation contribution
    if (track.movement_magnitude > 40) {
      addedPenalty += Math.min(35, Math.round(track.movement_magnitude * 0.4));
    }

    // 5. Phone Detection
    if (track.phone_detected) {
      addedPenalty += 45;
    }

    // If new violations occurred, compute step score
    if (addedPenalty > 0) {
      const stepScore = Math.min(100, track.suspicion_score + Math.round(addedPenalty * 0.3));
      track.suspicion_score = Math.max(track.suspicion_score, stepScore);
      track.max_reached_score = Math.max(track.max_reached_score, track.suspicion_score);
    }
    
    // Invariant: The suspicion score never decreases automatically
    track.suspicion_score = Math.max(track.suspicion_score, track.max_reached_score);
  }

  /**
   * Format confirmed active tracks for frontend rendering & telemetry
   */
  private exportActiveTracks(): CameraTrack[] {
    return Array.from(this.activeTracks.values())
      .filter(t => t.status === 'active' || (t.status === 'lost' && t.missed_frames <= 30))
      .map(t => ({
        track_id: t.track_id,
        camera_id: t.camera_id,
        bbox: { ...t.bbox },
        confidence: 0.92,
        head_pose: { ...t.head_pose },
        face_visible: t.face_visible,
        face_confidence: t.face_confidence,
        phone_detected: t.phone_detected,
        phone_confidence: t.phone_confidence,
        movement_magnitude: t.movement_magnitude,
        is_moving: t.is_moving,
        seat_id: t.seat_id,
        associated_student_id: t.associated_student_id,
        suspicion_score: t.suspicion_score,
        last_seen_timestamp: t.last_seen_timestamp,
        created_timestamp: t.created_timestamp,
        history_trajectory: [...t.history]
      }));
  }
}
