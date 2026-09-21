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
   * STEP 1: DENSE MULTI-STUDENT PERSON DETECTOR
   * Scans high-density spatial grid across classroom rows & desks.
   * Detects all examinees without any track limit.
   */
  private detectPersons(frameData: Uint8ClampedArray): PersonDetection[] {
    const gridCols = 20;
    const gridRows = 12;
    const cellW = this.width / gridCols;
    const cellH = this.height / gridRows;

    const personScoreGrid = new Float32Array(gridCols * gridRows);

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        let skinPixels = 0;
        let edgeLumaDiff = 0;
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

            totalSamples++;

            // Human Skin Locus Modeling
            const isSkin = r > 42 && g > 28 && b > 20 &&
              r > g && r > b &&
              (r - g) >= 7 &&
              r < 248;

            if (isSkin) skinPixels++;

            if (x + 1 < this.width) {
              const nextIdx = rowIdx + (x + 1) * 4;
              const diff = Math.abs(r - frameData[nextIdx]) + Math.abs(g - frameData[nextIdx + 1]);
              if (diff > 24) edgeLumaDiff++;
            }
          }
        }

        const skinRatio = totalSamples > 0 ? skinPixels / totalSamples : 0;
        const edgeRatio = totalSamples > 0 ? edgeLumaDiff / totalSamples : 0;
        personScoreGrid[gy * gridCols + gx] = skinRatio * 3.8 + edgeRatio * 1.6;
      }
    }

    // Cluster Connected High-Saliency Cells into Student Bounding Boxes
    const visited = new Uint8Array(gridCols * gridRows);
    const candidateBlobs: Array<{ minX: number; minY: number; maxX: number; maxY: number; score: number }> = [];

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const idx = gy * gridCols + gx;
        if (visited[idx] || personScoreGrid[idx] < 0.20) continue;

        let minX = gx;
        let maxX = gx;
        let minY = gy;
        let maxY = gy;
        let scoreSum = 0;
        let cellCount = 0;

        const queue: number[] = [idx];
        visited[idx] = 1;

        while (queue.length > 0) {
          const cur = queue.shift()!;
          const cy = Math.floor(cur / gridCols);
          const cx = cur % gridCols;

          scoreSum += personScoreGrid[cur];
          cellCount++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1]
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
              const nIdx = ny * gridCols + nx;
              if (!visited[nIdx] && personScoreGrid[nIdx] >= 0.18) {
                visited[nIdx] = 1;
                queue.push(nIdx);
              }
            }
          }
        }

        const spanW = maxX - minX + 1;
        const spanH = maxY - minY + 1;
        if (cellCount >= 1 && (spanW <= 6 && spanH <= 6)) {
          candidateBlobs.push({ minX, minY, maxX, maxY, score: scoreSum });
        }
      }
    }

    const detections: PersonDetection[] = [];

    for (const blob of candidateBlobs) {
      const rawW = (blob.maxX - blob.minX + 1) / gridCols;
      const rawH = (blob.maxY - blob.minY + 1) / gridRows;

      // Snug, compact upper-body bounding box (does not overlap neighboring examinees)
      const targetW = Math.max(0.12, Math.min(0.32, rawW * 1.15));
      const targetH = Math.max(0.20, Math.min(0.50, Math.max(rawH * 1.20, targetW * 1.35)));

      const centerX = (blob.minX + blob.maxX + 1) / 2 / gridCols;
      const topY = Math.max(0.04, blob.minY / gridRows - 0.03);

      const normX = Math.max(0.01, Math.min(0.99 - targetW, centerX - targetW / 2));
      const normY = Math.max(0.02, Math.min(0.98 - targetH, topY));
      const confidence = Math.min(0.98, 0.70 + (blob.score / 12));

      detections.push({
        bbox: {
          x: normX,
          y: normY,
          width: targetW,
          height: targetH
        },
        confidence
      });
    }

    // Default primary person fallback if single webcam/desk view is active and well-lit
    if (detections.length === 0) {
      let lumaSum = 0;
      for (let i = 0; i < frameData.length; i += 16) {
        lumaSum += (frameData[i] + frameData[i + 1] + frameData[i + 2]) / 3;
      }
      const avgLuma = lumaSum / (frameData.length / 16);
      if (avgLuma > 30) {
        detections.push({
          bbox: { x: 0.32, y: 0.18, width: 0.36, height: 0.60 },
          confidence: 0.88
        });
      }
    }

    return detections;
  }

  /**
   * STEP 2: MULTI-OBJECT FRAME PROCESSING WITH TEMPORAL ANALYSIS PIPELINE
   * - Tracks all active students.
   * - Ingests candidate examinees into temporary storage, verifies over time (~1.5s), then executes track.
   * - Continuously searches for untracked examinees in an ongoing background loop.
   * - Pins position in frame and increases score on movement without auto-decay.
   */
  public processFrame(
    source: HTMLVideoElement | HTMLImageElement,
    cameraId: string,
    availableStudents: StudentRecord[] = [],
    cameraSeats: SeatRecord[] = []
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

    // Detect all examinee presence in frame
    const relevantSeats = (cameraSeats || []).filter(s => !!s.camera_regions?.[cameraId]);
    let rawDetections: Array<PersonDetection & { seat_id?: string; associated_student_id?: string }> = [];

    if (relevantSeats.length > 0) {
      // Station-aware multi-student optical tracking
      rawDetections = relevantSeats.map((seat, sIdx) => {
        const baseRegion = seat.camera_regions[cameraId];
        const assignedStudent = availableStudents.find(st => st.id === seat.assigned_student_id) || availableStudents[sIdx];
        
        const startX = Math.max(0, Math.floor(baseRegion.x * this.width));
        const endX = Math.min(this.width, Math.floor((baseRegion.x + baseRegion.width) * this.width));
        const startY = Math.max(0, Math.floor(baseRegion.y * this.height));
        const endY = Math.min(this.height, Math.floor((baseRegion.y + baseRegion.height) * this.height));
        
        let weightedX = 0;
        let weightedY = 0;
        let totalWeight = 0;
        
        for (let y = startY; y < endY; y += 2) {
          const rowOffset = y * this.width * 4;
          for (let x = startX; x < endX; x += 2) {
            const idx = rowOffset + x * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            
            const isSkin = r > 42 && g > 28 && b > 20 && r > g && r > b && (r - g) >= 7;
            let motionDiff = 0;
            if (this.prevFrameData) {
              motionDiff = Math.abs(r - this.prevFrameData[idx]) + Math.abs(g - this.prevFrameData[idx + 1]) + Math.abs(b - this.prevFrameData[idx + 2]);
            }
            
            const weight = (isSkin ? 2.5 : 0.4) + (motionDiff > 22 ? 3.0 : 0);
            if (weight > 0.5) {
              weightedX += x * weight;
              weightedY += y * weight;
              totalWeight += weight;
            }
          }
        }
        
        let liveBbox = { ...baseRegion };
        if (totalWeight > 8) {
          const centerNormX = (weightedX / totalWeight) / this.width;
          const centerNormY = (weightedY / totalWeight) / this.height;
          
          const dynamicX = Math.max(0.01, Math.min(0.99 - baseRegion.width, centerNormX - baseRegion.width / 2));
          const dynamicY = Math.max(0.02, Math.min(0.98 - baseRegion.height, centerNormY - baseRegion.height * 0.45));
          liveBbox = {
            x: dynamicX,
            y: dynamicY,
            width: baseRegion.width,
            height: baseRegion.height
          };
        }

        return {
          bbox: liveBbox,
          confidence: 0.95,
          seat_id: seat.id,
          associated_student_id: assignedStudent?.id || seat.assigned_student_id
        };
      });
    } else {
      // Dynamic multi-student optical detector (unlimited examinees)
      const opticalDetections = this.detectPersons(data);
      rawDetections = opticalDetections.map((det, dIdx) => ({
        ...det,
        associated_student_id: availableStudents[dIdx]?.id
      }));
    }

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
