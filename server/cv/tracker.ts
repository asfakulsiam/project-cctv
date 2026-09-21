/**
 * Smart Classroom Exam Monitoring System
 * Production Multi-Person Computer Vision Tracker (SORT-Enhanced with HumanGate & Kinematics)
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. Human Detection is the Gatekeeper: Only positive human detections enter the tracker.
 * 2. Independent Per-Camera Context: All track IDs are strictly camera-scoped (e.g., CAM1-S001).
 * 3. Temporal Candidate Confirmation: Human detections must pass multi-frame confirmation before receiving a permanent ID.
 * 4. Stationary Persistence: Tracks never vanish or cycle simply because a student remains still.
 * 5. Monotonically Non-Decreasing Score: Suspicion score never auto-decays; warnings latch until cleared by admin.
 */

import { BoundingBox, CameraTrack, HeadPoseData, HumanDetection } from '../../src/types.js';

export type TrackStatus = 'candidate' | 'active' | 'lost' | 'terminated';

export interface InternalTrackState {
  track_id: string;
  camera_id: string;
  status: TrackStatus;
  bbox: BoundingBox;
  target_bbox: BoundingBox;
  confidence: number;
  
  // Kinematics & Prediction
  velocity_x: number; // Normalized coordinate delta per second
  velocity_y: number;
  last_update_time: number;
  hits: number;
  missed_frames: number;

  // Observation attributes
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
  suspicion_score: number;
  max_reached_score: number;
  warning_latched: boolean;
  warning_cleared_at?: number;
  last_seen_timestamp: number;
  created_timestamp: number;
  history: Array<{ x: number; y: number; t: number }>;
}

export class CameraTracker {
  public readonly camera_id: string;
  private readonly camera_prefix: string;
  private next_track_number = 1;
  private active_tracks: Map<string, InternalTrackState> = new Map();
  private candidate_tracks: Map<string, InternalTrackState> = new Map();
  private next_candidate_number = 1;

  // Configuration thresholds
  private readonly confirmation_hits_required = 3; // Must be detected in 3 frames to confirm
  private readonly max_missed_frames = 18;         // Maintain lost track with prediction for up to ~1.2s
  private readonly iou_threshold = 0.15;           // Relaxed IoU when combined with center distance

  constructor(camera_id: string) {
    this.camera_id = camera_id;
    // Derive clean uppercase camera prefix: "cam-1" -> "CAM1"
    this.camera_prefix = camera_id.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /**
   * Generate permanent camera-scoped tracking identifier upon track confirmation.
   * Example: CAM1-S001, CAM1-S002
   */
  private generateTrackId(): string {
    const numStr = String(this.next_track_number++).padStart(3, '0');
    return `${this.camera_prefix}-S${numStr}`;
  }

  /**
   * Calculate center-to-center Euclidean distance between two bounding boxes.
   */
  private computeCenterDistance(b1: BoundingBox, b2: BoundingBox): number {
    const ax = b1.x + b1.width / 2;
    const ay = b1.y + b1.height / 2;
    const bx = b2.x + b2.width / 2;
    const by = b2.y + b2.height / 2;
    return Math.hypot(ax - bx, ay - by);
  }

  /**
   * Calculate Intersection-over-Union (IoU) between two bounding boxes.
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
   * Predict bounding box location at timestamp based on velocity estimation.
   */
  private predictBoundingBox(track: InternalTrackState, dtSec: number): BoundingBox {
    const clampedDt = Math.min(0.5, Math.max(0, dtSec));
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
   * Compute maximum allowable association distance scaled to bounding box diagonal.
   */
  private maxAssociationDistance(bbox: BoundingBox): number {
    const diag = Math.hypot(bbox.width, bbox.height);
    return Math.max(0.18, Math.min(0.45, diag * 0.75));
  }

  /**
   * Ingest confirmed human detections for the current frame, execute state machine updates, and output active tracks.
   * INVARIANT: Only human detections are accepted.
   */
  public updateDetections(
    humanDetections: HumanDetection[],
    now: number = Date.now()
  ): CameraTrack[] {
    const matchedConfirmedIds = new Set<string>();
    const matchedCandidateIds = new Set<string>();
    const unmatchedDetections: HumanDetection[] = [];

    // -------------------------------------------------------------
    // STEP 1: Associate human detections with confirmed ACTIVE & LOST tracks
    // -------------------------------------------------------------
    for (const det of humanDetections) {
      let bestMatchId: string | null = null;
      let highestScore = 0;

      for (const [trackId, track] of this.active_tracks.entries()) {
        if (matchedConfirmedIds.has(trackId)) continue;

        const dtSec = (now - track.last_update_time) / 1000;
        const predictedBox = this.predictBoundingBox(track, dtSec);

        const iou = this.computeIoU(predictedBox, det.bbox);
        const dist = this.computeCenterDistance(predictedBox, det.bbox);
        const maxDist = this.maxAssociationDistance(predictedBox);

        if (iou >= this.iou_threshold || dist <= maxDist) {
          const affinity = iou * 0.6 + Math.max(0, 1 - dist / maxDist) * 0.4;
          if (affinity > highestScore) {
            highestScore = affinity;
            bestMatchId = trackId;
          }
        }
      }

      if (bestMatchId) {
        matchedConfirmedIds.add(bestMatchId);
        const track = this.active_tracks.get(bestMatchId)!;

        // Kinematics & Velocity Update (Smoothed EMA)
        const dtSec = Math.max(0.01, (now - track.last_update_time) / 1000);
        const dx = det.bbox.x - track.bbox.x;
        const dy = det.bbox.y - track.bbox.y;
        const instVx = dx / dtSec;
        const instVy = dy / dtSec;

        const velAlpha = 0.25;
        track.velocity_x = track.velocity_x * (1 - velAlpha) + instVx * velAlpha;
        track.velocity_y = track.velocity_y * (1 - velAlpha) + instVy * velAlpha;

        // Bounding Box Smoothing
        const posAlpha = 0.35;
        track.bbox = {
          x: track.bbox.x * (1 - posAlpha) + det.bbox.x * posAlpha,
          y: track.bbox.y * (1 - posAlpha) + det.bbox.y * posAlpha,
          width: track.bbox.width * (1 - posAlpha) + det.bbox.width * posAlpha,
          height: track.bbox.height * (1 - posAlpha) + det.bbox.height * posAlpha
        };

        const displacement = Math.hypot(dx, dy);
        const movement_magnitude = Math.min(100, Math.round(displacement * 500));
        const is_moving = movement_magnitude > 6;

        track.target_bbox = det.bbox;
        track.confidence = det.confidence;
        track.head_pose = det.head_pose || track.head_pose;
        track.face_visible = det.face_visible !== undefined ? det.face_visible : track.face_visible;
        track.face_confidence = det.face_confidence ?? track.face_confidence;
        track.phone_detected = det.phone_detected ?? false;
        track.phone_confidence = det.phone_confidence ?? 0;
        track.movement_magnitude = movement_magnitude;
        track.is_moving = is_moving;
        if (det.seat_id) track.seat_id = det.seat_id;
        if (det.associated_student_id) track.associated_student_id = det.associated_student_id;
        
        // Status & Lifecycle
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
    // STEP 2: Match remaining human detections against CANDIDATE tracks
    // -------------------------------------------------------------
    const stillUnmatched: HumanDetection[] = [];

    for (const det of unmatchedDetections) {
      let bestCandidateId: string | null = null;
      let highestCandScore = 0;

      for (const [candId, cand] of this.candidate_tracks.entries()) {
        if (matchedCandidateIds.has(candId)) continue;
        const iou = this.computeIoU(cand.bbox, det.bbox);
        const dist = this.computeCenterDistance(cand.bbox, det.bbox);
        const maxDist = this.maxAssociationDistance(cand.bbox);

        if (iou >= this.iou_threshold || dist <= maxDist) {
          const score = iou * 0.5 + Math.max(0, 1 - dist / maxDist) * 0.5;
          if (score > highestCandScore) {
            highestCandScore = score;
            bestCandidateId = candId;
          }
        }
      }

      if (bestCandidateId) {
        matchedCandidateIds.add(bestCandidateId);
        const cand = this.candidate_tracks.get(bestCandidateId)!;
        cand.hits++;
        cand.missed_frames = 0;
        cand.last_seen_timestamp = now;
        cand.last_update_time = now;
        cand.bbox = { ...det.bbox };

        if (cand.hits >= this.confirmation_hits_required) {
          this.candidate_tracks.delete(bestCandidateId);
          const permanentTrackId = this.generateTrackId();
          cand.track_id = permanentTrackId;
          cand.status = 'active';
          this.active_tracks.set(permanentTrackId, cand);
        }
      } else {
        stillUnmatched.push(det);
      }
    }

    // -------------------------------------------------------------
    // STEP 3: Spawn new candidate tracks for unassigned human detections
    // -------------------------------------------------------------
    for (const det of stillUnmatched) {
      const candId = `cand-${this.next_candidate_number++}`;
      const newCand: InternalTrackState = {
        track_id: candId,
        camera_id: this.camera_id,
        status: 'candidate',
        bbox: { ...det.bbox },
        target_bbox: { ...det.bbox },
        confidence: det.confidence,
        velocity_x: 0,
        velocity_y: 0,
        last_update_time: now,
        hits: 1,
        missed_frames: 0,
        head_pose: det.head_pose || { yaw: 0, pitch: 0, direction: 'center', confidence: 0.9 },
        face_visible: det.face_visible !== undefined ? det.face_visible : true,
        face_confidence: det.face_confidence ?? 0.88,
        phone_detected: det.phone_detected ?? false,
        phone_confidence: det.phone_confidence ?? 0,
        movement_magnitude: 0,
        is_moving: false,
        is_confirmed_human: true,
        seat_id: det.seat_id,
        associated_student_id: det.associated_student_id,
        suspicion_score: 0,
        max_reached_score: 0,
        warning_latched: false,
        last_seen_timestamp: now,
        created_timestamp: now,
        history: [{ x: det.bbox.x + det.bbox.width / 2, y: det.bbox.y + det.bbox.height / 2, t: now }]
      };
      this.candidate_tracks.set(candId, newCand);
    }

    // -------------------------------------------------------------
    // STEP 4: Handle missed frames & prune candidate / active tracks
    // -------------------------------------------------------------
    for (const [candId, cand] of this.candidate_tracks.entries()) {
      if (!matchedCandidateIds.has(candId)) {
        cand.missed_frames++;
        if (cand.missed_frames > 2) {
          this.candidate_tracks.delete(candId);
        }
      }
    }

    for (const [trackId, track] of this.active_tracks.entries()) {
      if (!matchedConfirmedIds.has(trackId)) {
        track.missed_frames++;
        track.status = 'lost';
        track.movement_magnitude = 0;
        track.is_moving = false;

        const dtSec = Math.max(0.01, (now - track.last_update_time) / 1000);
        track.bbox = this.predictBoundingBox(track, dtSec);
        track.last_update_time = now;

        if (track.missed_frames > this.max_missed_frames) {
          track.status = 'terminated';
          this.active_tracks.delete(trackId);
        }
      }
    }

    return Array.from(this.active_tracks.values())
      .filter(t => t.status === 'active' || (t.status === 'lost' && t.missed_frames <= 6))
      .map(t => ({
        track_id: t.track_id,
        camera_id: t.camera_id,
        bbox: { ...t.bbox },
        confidence: t.confidence,
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

  /**
   * Reset tracker context
   */
  public reset(): void {
    this.active_tracks.clear();
    this.candidate_tracks.clear();
    this.next_track_number = 1;
    this.next_candidate_number = 1;
  }

  /**
   * Update suspicion score monotonically (never decreases automatically)
   */
  public setTrackSuspicion(track_id: string, score: number): void {
    const track = this.active_tracks.get(track_id);
    if (track) {
      track.suspicion_score = Math.min(100, Math.max(track.suspicion_score, score));
      track.max_reached_score = Math.max(track.max_reached_score, track.suspicion_score);
      if (track.suspicion_score >= 65) {
        track.warning_latched = true;
      }
    }
  }

  /**
   * Admin action: Unlatch warning while preserving the suspicion score
   */
  public clearTrackWarning(track_id: string): void {
    const track = this.active_tracks.get(track_id);
    if (track) {
      track.warning_latched = false;
      track.warning_cleared_at = Date.now();
    }
  }

  /**
   * Admin action: Reset track score
   */
  public resetTrackScore(track_id: string): void {
    const track = this.active_tracks.get(track_id);
    if (track) {
      track.suspicion_score = 0;
      track.max_reached_score = 0;
      track.warning_latched = false;
    }
  }

  public getTrackCount(): number {
    return this.active_tracks.size;
  }

  public getActiveTrackIds(): string[] {
    return Array.from(this.active_tracks.keys());
  }
}
