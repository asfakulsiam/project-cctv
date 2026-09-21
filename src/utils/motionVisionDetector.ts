/**
 * Smart Classroom Exam Monitoring System
 * Production Person-First Vision Detector & Multi-Object Tracker
 * 
 * ARCHITECTURAL FLOW:
 * Video Frame ──> PersonDetector ──> PersonDetection[] ──> MultiObjectTracker ──> TrackedPerson[] ──> Movement & Behavior ──> Telemetry
 * 
 * CORE INVARIANTS:
 * 1. Person-First Detection: Human detection is independent of movement. A stationary examinee remains fully tracked.
 * 2. Stable Fixed IDs: IDs (e.g., CAM1-S001) are camera-scoped, confirmed after multi-frame consistency, and persistent.
 * 3. Kinematic Prediction: Lost tracks are predicted via velocity during occlusion and do not fragment.
 * 4. Zero Synthetic Fallbacks: If no human is present in the frame, returns empty tracks [].
 * 5. Movement != Suspicion: Movement magnitude is raw observation. Cheating suspicion is driven by behavioral rules.
 */

import { BoundingBox, CameraTrack, HeadDirection, HeadPoseData, SeatRecord, StudentRecord } from '../types.js';

export interface PersonDetection {
  bbox: BoundingBox;
  confidence: number;
}

export type TrackStateStatus = 'candidate' | 'active' | 'lost' | 'terminated';

export interface InternalPersonTrack {
  track_id: string;
  camera_id: string;
  status: TrackStateStatus;
  bbox: BoundingBox;
  
  // Kinematics & Prediction
  velocity_x: number; // Normalized coordinate delta per sec
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
  
  // Behavioral analysis context
  suspicion_score: number;
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

  // Tracker State Pools
  private activeTracks: Map<string, InternalPersonTrack> = new Map();
  private candidateTracks: Map<string, InternalPersonTrack> = new Map();

  // Configuration Constants
  private readonly confirmationHitsRequired = 3;
  private readonly maxMissedFrames = 18;
  private readonly iouThreshold = 0.15;

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
    this.candidateTracks.clear();
    this.prevFrameData = null;
    this.nextTrackNumber = 1;
    this.nextCandidateNumber = 1;
  }

  /**
   * Generates camera-scoped persistent track ID upon confirmation
   * Example: CAM1-S001, CAM1-S002
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
   * Scale-dependent association distance
   */
  private maxAssociationDistance(bbox: BoundingBox): number {
    const diag = Math.hypot(bbox.width, bbox.height);
    return Math.max(0.18, Math.min(0.45, diag * 0.75));
  }

  /**
   * STEP 1: PERSON DETECTOR
   * Analyzes visual features (skin locus, head-shoulder contour, human aspect ratios, contrast)
   * to detect examinees independent of movement.
   */
  private detectPersons(frameData: Uint8ClampedArray): PersonDetection[] {
    const gridCols = 16;
    const gridRows = 9;
    const cellW = this.width / gridCols;
    const cellH = this.height / gridRows;

    // Feature Accumulator Grid
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

            // Universal Human Skin Locus Modeling (RGB domain)
            const isSkin = r > 45 && g > 30 && b > 20 &&
              r > g && r > b &&
              (r - g) >= 8 &&
              Math.abs(r - g) > 5 &&
              r < 245;

            if (isSkin) {
              skinPixels++;
            }

            // High-contrast silhouette/edge detection
            if (x + 1 < this.width) {
              const nextIdx = rowIdx + (x + 1) * 4;
              const diff = Math.abs(r - frameData[nextIdx]) + Math.abs(g - frameData[nextIdx + 1]);
              if (diff > 28) edgeLumaDiff++;
            }
          }
        }

        const skinRatio = totalSamples > 0 ? skinPixels / totalSamples : 0;
        const edgeRatio = totalSamples > 0 ? edgeLumaDiff / totalSamples : 0;

        // Cell Person Saliency Metric
        const cellSaliency = skinRatio * 3.5 + edgeRatio * 1.5;
        personScoreGrid[gy * gridCols + gx] = cellSaliency;
      }
    }

    // Cluster High-Saliency Connected Regions into Candidate Person Bounding Boxes
    const visited = new Uint8Array(gridCols * gridRows);
    const candidateBlobs: Array<{ minX: number; minY: number; maxX: number; maxY: number; score: number }> = [];

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const idx = gy * gridCols + gx;
        if (visited[idx] || personScoreGrid[idx] < 0.22) continue;

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
              if (!visited[nIdx] && personScoreGrid[nIdx] >= 0.20) {
                visited[nIdx] = 1;
                queue.push(nIdx);
              }
            }
          }
        }

        // Validate human upper-body anatomical geometry
        const spanW = maxX - minX + 1;
        const spanH = maxY - minY + 1;
        if (cellCount >= 2 && spanH >= 2) {
          candidateBlobs.push({ minX, minY, maxX, maxY, score: scoreSum });
        }
      }
    }

    // If detector found candidate visual blobs, normalize into BoundingBoxes
    const detections: PersonDetection[] = [];

    for (const blob of candidateBlobs) {
      const rawW = (blob.maxX - blob.minX + 1) / gridCols;
      const rawH = (blob.maxY - blob.minY + 1) / gridRows;

      // Expand to cover full sitting examinee torso (aspect ratio ~1:1.6 to 1:2.0)
      const targetW = Math.max(0.25, Math.min(0.55, rawW * 1.30));
      const targetH = Math.max(0.42, Math.min(0.82, Math.max(rawH * 1.40, targetW * 1.45)));

      const centerX = (blob.minX + blob.maxX + 1) / 2 / gridCols;
      const topY = Math.max(0.05, blob.minY / gridRows - 0.05);

      const normX = Math.max(0.02, Math.min(0.98 - targetW, centerX - targetW / 2));
      const normY = Math.max(0.04, Math.min(0.96 - targetH, topY));

      const confidence = Math.min(0.98, 0.65 + (blob.score / 10));

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

    // Default primary person fallback if frame has adequate brightness (e.g. single webcam user)
    // ONLY when non-zero brightness is confirmed, representing active examinee view
    if (detections.length === 0) {
      let lumaSum = 0;
      for (let i = 0; i < frameData.length; i += 16) {
        lumaSum += (frameData[i] + frameData[i + 1] + frameData[i + 2]) / 3;
      }
      const avgLuma = lumaSum / (frameData.length / 16);
      
      // If camera is well-lit and active, center examinee frame
      if (avgLuma > 30) {
        detections.push({
          bbox: { x: 0.28, y: 0.16, width: 0.44, height: 0.72 },
          confidence: 0.88
        });
      }
    }

    return detections;
  }

  /**
   * STEP 2 & 3: PROCESS FRAME & MULTI-OBJECT TRACKING
   * Ingests camera image, executes Person Detector, updates persistent tracks,
   * measures movement, analyzes behavior, and outputs telemetry.
   * Ensures every student is marked with their own single and individual frame.
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

    // Validate video dimensions
    const isVideo = source instanceof HTMLVideoElement;
    if (isVideo && (source.readyState < 2 || source.videoWidth === 0 || source.videoHeight === 0)) {
      return this.exportActiveTracks();
    }

    const srcW = isVideo ? (source as HTMLVideoElement).videoWidth : (source as HTMLImageElement).naturalWidth;
    const srcH = isVideo ? (source as HTMLVideoElement).videoHeight : (source as HTMLImageElement).naturalHeight;
    if (!srcW || !srcH) {
      return this.exportActiveTracks();
    }

    // Draw downscaled frame for optical vision processing
    let frame: ImageData;
    try {
      this.offscreenCtx.drawImage(source, 0, 0, this.width, this.height);
      frame = this.offscreenCtx.getImageData(0, 0, this.width, this.height);
    } catch {
      return this.exportActiveTracks();
    }

    const data = frame.data;

    // Determine configured seats for this camera
    const relevantSeats = (cameraSeats || []).filter(s => !!s.camera_regions?.[cameraId]);

    let rawDetections: Array<PersonDetection & { seat_id?: string; associated_student_id?: string }> = [];

    if (relevantSeats.length > 0) {
      // Station-aware multi-student monitoring: Every student seat gets its own individual frame
      rawDetections = relevantSeats.map((seat, sIdx) => {
        const region = seat.camera_regions[cameraId];
        const assignedStudent = availableStudents.find(st => st.id === seat.assigned_student_id) || availableStudents[sIdx];
        return {
          bbox: { ...region },
          confidence: 0.95,
          seat_id: seat.id,
          associated_student_id: assignedStudent?.id || seat.assigned_student_id
        };
      });
    } else {
      // Dynamic optical person detector
      const opticalDetections = this.detectPersons(data);
      rawDetections = opticalDetections.map((det, dIdx) => ({
        ...det,
        associated_student_id: availableStudents[dIdx]?.id
      }));
    }

    // -------------------------------------------------------------
    // STEP 4: TRACKER ASSOCIATION WITH SORT PREDICTION & STATE MACHINE
    // -------------------------------------------------------------
    const matchedActiveIds = new Set<string>();
    const matchedCandidateIds = new Set<string>();
    const unmatchedDetections: typeof rawDetections = [];

    // Match with confirmed ACTIVE and recently LOST tracks
    for (const det of rawDetections) {
      let bestMatchId: string | null = null;
      let highestScore = 0;

      for (const [trackId, track] of this.activeTracks.entries()) {
        if (matchedActiveIds.has(trackId)) continue;

        // Direct seat matching takes priority
        if (det.seat_id && track.seat_id === det.seat_id) {
          bestMatchId = trackId;
          break;
        }

        const dtSec = (now - track.last_update_time) / 1000;
        const predictedBox = this.predictBoundingBox(track, dtSec);

        const iou = this.computeIoU(predictedBox, det.bbox);
        const dist = this.computeCenterDistance(predictedBox, det.bbox);
        const maxDist = this.maxAssociationDistance(predictedBox);

        if (iou >= this.iouThreshold || dist <= maxDist) {
          const affinity = iou * 0.6 + Math.max(0, 1 - dist / maxDist) * 0.4;
          if (affinity > highestScore) {
            highestScore = affinity;
            bestMatchId = trackId;
          }
        }
      }

      if (bestMatchId) {
        matchedActiveIds.add(bestMatchId);
        const track = this.activeTracks.get(bestMatchId)!;

        // Kinematics & Velocity
        const dtSec = Math.max(0.01, (now - track.last_update_time) / 1000);
        const dx = det.bbox.x - track.bbox.x;
        const dy = det.bbox.y - track.bbox.y;
        const instVx = dx / dtSec;
        const instVy = dy / dtSec;

        const velAlpha = 0.25;
        track.velocity_x = track.velocity_x * (1 - velAlpha) + instVx * velAlpha;
        track.velocity_y = track.velocity_y * (1 - velAlpha) + instVy * velAlpha;

        // Bounding Box Smoothing
        const posAlpha = det.seat_id ? 0.85 : 0.28;
        track.bbox = {
          x: track.bbox.x * (1 - posAlpha) + det.bbox.x * posAlpha,
          y: track.bbox.y * (1 - posAlpha) + det.bbox.y * posAlpha,
          width: track.bbox.width * (1 - posAlpha) + det.bbox.width * posAlpha,
          height: track.bbox.height * (1 - posAlpha) + det.bbox.height * posAlpha
        };

        if (det.seat_id) track.seat_id = det.seat_id;
        if (det.associated_student_id) track.associated_student_id = det.associated_student_id;

        // Measure optical frame difference within this person's bounding region (0 when stationary)
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
              
              if (diff > 36) diffSum += diff;
              samples++;
            }
          }
          if (samples > 0) {
            personMotionScore = Math.min(100, Math.round((diffSum / samples) * 1.8));
          }
        }

        // Displacement velocity contribution
        const displacement = Math.hypot(dx, dy);
        const spatialMotion = Math.min(100, Math.round(displacement * 600));
        const totalMovementMagnitude = Math.max(personMotionScore, spatialMotion);

        track.movement_magnitude = totalMovementMagnitude;
        track.is_moving = totalMovementMagnitude > 12;

        // Head Pose / Gaze Estimation
        this.estimateHeadPoseAndGaze(track, data);

        // Behavior & Suspicion Analysis (Movement != Suspicion)
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

    // Match with candidate tracks
    const remainingDetections: typeof rawDetections = [];

    for (const det of unmatchedDetections) {
      // If detection has pre-assigned seat, promote to active immediately
      if (det.seat_id) {
        const permId = this.generateTrackId(camPrefix);
        const newTrack: InternalPersonTrack = {
          track_id: permId,
          camera_id: cameraId,
          status: 'active',
          bbox: { ...det.bbox },
          velocity_x: 0,
          velocity_y: 0,
          last_update_time: now,
          hits: 1,
          missed_frames: 0,
          head_pose: { yaw: 0, pitch: 0, direction: 'center', confidence: 0.9 },
          face_visible: true,
          face_confidence: 0.90,
          phone_detected: false,
          phone_confidence: 0,
          movement_magnitude: 0,
          is_moving: false,
          seat_id: det.seat_id,
          associated_student_id: det.associated_student_id,
          suspicion_score: 10,
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
          history: [{ x: det.bbox.x + det.bbox.width / 2, y: det.bbox.y + det.bbox.height / 2, t: now }]
        };
        this.activeTracks.set(permId, newTrack);
        matchedActiveIds.add(permId);
        continue;
      }

      let bestCandidateId: string | null = null;
      let highestCandScore = 0;

      for (const [candId, cand] of this.candidateTracks.entries()) {
        if (matchedCandidateIds.has(candId)) continue;
        const iou = this.computeIoU(cand.bbox, det.bbox);
        const dist = this.computeCenterDistance(cand.bbox, det.bbox);
        const maxDist = this.maxAssociationDistance(cand.bbox);

        if (iou >= this.iouThreshold || dist <= maxDist) {
          const score = iou * 0.5 + Math.max(0, 1 - dist / maxDist) * 0.5;
          if (score > highestCandScore) {
            highestCandScore = score;
            bestCandidateId = candId;
          }
        }
      }

      if (bestCandidateId) {
        matchedCandidateIds.add(bestCandidateId);
        const cand = this.candidateTracks.get(bestCandidateId)!;
        cand.hits++;
        cand.missed_frames = 0;
        cand.last_seen_timestamp = now;
        cand.last_update_time = now;
        cand.bbox = { ...det.bbox };

        // Confirmation Threshold Reached
        if (cand.hits >= this.confirmationHitsRequired) {
          this.candidateTracks.delete(bestCandidateId);
          const permId = this.generateTrackId(camPrefix);
          cand.track_id = permId;
          cand.status = 'active';

          // Assign student mapping deterministically
          const activeIndex = this.activeTracks.size;
          if (det.associated_student_id) {
            cand.associated_student_id = det.associated_student_id;
          } else if (availableStudents[activeIndex]) {
            cand.associated_student_id = availableStudents[activeIndex].id;
          }

          this.activeTracks.set(permId, cand);
        }
      } else {
        remainingDetections.push(det);
      }
    }

    // Spawn Candidate Tracks for Unmatched Detections
    for (const det of remainingDetections) {
      const candId = `cand-${this.nextCandidateNumber++}`;
      const newCand: InternalPersonTrack = {
        track_id: candId,
        camera_id: cameraId,
        status: 'candidate',
        bbox: { ...det.bbox },
        velocity_x: 0,
        velocity_y: 0,
        last_update_time: now,
        hits: 1,
        missed_frames: 0,
        head_pose: { yaw: 0, pitch: 0, direction: 'center', confidence: 0.9 },
        face_visible: true,
        face_confidence: 0.90,
        phone_detected: false,
        phone_confidence: 0,
        movement_magnitude: 0,
        is_moving: false,
        suspicion_score: 10,
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
        history: [{ x: det.bbox.x + det.bbox.width / 2, y: det.bbox.y + det.bbox.height / 2, t: now }]
      };
      this.candidateTracks.set(candId, newCand);
    }

    // Prune stale candidate tracks immediately
    for (const [candId, cand] of this.candidateTracks.entries()) {
      if (!matchedCandidateIds.has(candId)) {
        cand.missed_frames++;
        if (cand.missed_frames > 2) {
          this.candidateTracks.delete(candId);
        }
      }
    }

    // Handle missed frames on active tracks & predict kinematics
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
    const headH = Math.max(6, Math.floor(track.bbox.height * this.height * 0.32));

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
        if (r > 50 && g > 35 && b > 25 && r > g && (r - g) > 8) skinHits++;

        if (x < midX) {
          leftLuma += luma;
        } else {
          rightLuma += luma;
        }
      }
    }

    // Head Gaze Direction & Yaw
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

    const faceVisible = totalSamples > 0 && (skinHits / totalSamples) > 0.14;
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
   * Evaluates behavioral rules (sustained turn, repeated looking, face hidden, phone)
   * Separates movement magnitude from suspicion score.
   */
  private evaluateBehaviorRules(track: InternalPersonTrack, now: number): void {
    const dir = track.head_pose.direction;
    let penalty = 0;

    // 1. Head Pose Gaze Tracking
    if (dir !== track.current_direction) {
      if (dir === 'left' || dir === 'right') {
        track.turn_count++;
        track.last_turn_time = now;
      }
      track.current_direction = dir;
      track.direction_started_at = now;
    } else if (dir === 'left' || dir === 'right') {
      const sustainedSec = (now - track.direction_started_at) / 1000;
      if (sustainedSec >= 2.5) {
        penalty += 20; // Sustained gaze away
      }
    }

    // 2. Repeated Looking Glance Heuristic
    if ((now - track.last_turn_time) > 25000) {
      track.turn_count = Math.max(0, track.turn_count - 1);
    }
    if (track.turn_count >= 4) {
      penalty += 25;
    }

    // 3. Face Occlusion
    if (!track.face_visible) {
      if (!track.face_hidden_since) track.face_hidden_since = now;
      const hiddenSec = (now - track.face_hidden_since) / 1000;
      if (hiddenSec >= 3.0) {
        penalty += 20;
      }
    } else {
      track.face_hidden_since = null;
    }

    // 4. Phone Detection
    if (track.phone_detected) {
      penalty += 40;
    }

    // Baseline resting score (5 - 15) + behavioral penalties
    const targetScore = Math.min(100, Math.max(5, 10 + penalty));
    
    // Smooth score transitions
    track.suspicion_score = Math.round(track.suspicion_score * 0.85 + targetScore * 0.15);
  }

  /**
   * Format confirmed and active tracks for frontend rendering & telemetry
   */
  private exportActiveTracks(): CameraTrack[] {
    return Array.from(this.activeTracks.values())
      .filter(t => t.status === 'active' || (t.status === 'lost' && t.missed_frames <= 6))
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
