/**
 * Smart Classroom Exam Monitoring System
 * Per-Camera Independent Object Tracker
 * 
 * CRITICAL ARCHITECTURAL DIRECTIVE:
 * Every live camera MUST have its own independent processing/tracking context.
 * Global trackers are strictly forbidden. Track IDs are scoped with camera prefixes
 * (e.g., CAM1-S001, CAM2-S001) to prevent ID collision across multiple cameras.
 */

import { BoundingBox, CameraTrack, HeadPoseData } from '../../src/types.js';

interface InternalTrackState {
  track_id: string;
  camera_id: string;
  bbox: BoundingBox;
  target_bbox: BoundingBox;
  confidence: number;
  head_pose: HeadPoseData;
  face_visible: boolean;
  face_confidence: number;
  phone_detected: boolean;
  phone_confidence: number;
  movement_magnitude: number;
  is_moving: boolean;
  seat_id?: string;
  associated_student_id?: string;
  suspicion_score: number;
  last_seen_timestamp: number;
  created_timestamp: number;
  missed_frames: number;
  history: Array<{ x: number; y: number; t: number }>;
}

export class CameraTracker {
  public readonly camera_id: string;
  private readonly camera_prefix: string;
  private next_track_number = 1;
  private active_tracks: Map<string, InternalTrackState> = new Map();
  private max_missed_frames = 15; // Track dropped after 15 consecutive missing frames
  private iou_threshold = 0.25;

  /**
   * Initializes an independent tracker context for a single camera stream.
   * @param camera_id Unique camera identifier (e.g., "cam-1")
   */
  constructor(camera_id: string) {
    this.camera_id = camera_id;
    // Derive clean prefix: "cam-1" -> "CAM1"
    this.camera_prefix = camera_id.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /**
   * Generate a strictly scoped, camera-safe tracking identifier.
   * Example: CAM1-S001, CAM1-S002
   */
  private generateTrackId(): string {
    const numStr = String(this.next_track_number++).padStart(3, '0');
    return `${this.camera_prefix}-S${numStr}`;
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
   * Ingest raw detections for the current frame and update the camera's active track pool.
   * Applies smoothing, track association, velocity estimation, and track termination.
   */
  public updateDetections(
    rawDetections: Array<{
      bbox: BoundingBox;
      confidence: number;
      head_pose?: HeadPoseData;
      face_visible?: boolean;
      face_confidence?: number;
      phone_detected?: boolean;
      phone_confidence?: number;
      seat_id?: string;
      associated_student_id?: string;
    }>,
    now: number = Date.now()
  ): CameraTrack[] {
    const matchedTrackIds = new Set<string>();
    const unmatchedDetections: typeof rawDetections = [];

    // Step 1: Greedy IoU matching against existing tracks
    for (const det of rawDetections) {
      let bestMatchId: string | null = null;
      let highestIoU = this.iou_threshold;

      for (const [trackId, track] of this.active_tracks.entries()) {
        if (matchedTrackIds.has(trackId)) continue;
        const iou = this.computeIoU(track.bbox, det.bbox);
        if (iou > highestIoU) {
          highestIoU = iou;
          bestMatchId = trackId;
        }
      }

      if (bestMatchId) {
        matchedTrackIds.add(bestMatchId);
        const track = this.active_tracks.get(bestMatchId)!;

        // Exponential moving average for bounding box smoothing
        const alpha = 0.35;
        const smoothedBbox: BoundingBox = {
          x: track.bbox.x * (1 - alpha) + det.bbox.x * alpha,
          y: track.bbox.y * (1 - alpha) + det.bbox.y * alpha,
          width: track.bbox.width * (1 - alpha) + det.bbox.width * alpha,
          height: track.bbox.height * (1 - alpha) + det.bbox.height * alpha
        };

        // Movement velocity delta
        const dx = smoothedBbox.x - track.bbox.x;
        const dy = smoothedBbox.y - track.bbox.y;
        const displacement = Math.sqrt(dx * dx + dy * dy);
        const movement_magnitude = Math.min(100, Math.round(displacement * 600));
        const is_moving = movement_magnitude > 4;

        // Update track state
        track.bbox = smoothedBbox;
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
        track.last_seen_timestamp = now;
        track.missed_frames = 0;

        // Trajectory record
        track.history.push({ x: smoothedBbox.x + smoothedBbox.width / 2, y: smoothedBbox.y + smoothedBbox.height / 2, t: now });
        if (track.history.length > 20) track.history.shift();
      } else {
        unmatchedDetections.push(det);
      }
    }

    // Step 2: Initialize new tracks for unmatched detections
    for (const det of unmatchedDetections) {
      const newTrackId = this.generateTrackId();
      const newTrack: InternalTrackState = {
        track_id: newTrackId,
        camera_id: this.camera_id,
        bbox: { ...det.bbox },
        target_bbox: { ...det.bbox },
        confidence: det.confidence,
        head_pose: det.head_pose || { yaw: 0, pitch: 0, direction: 'center', confidence: 0.9 },
        face_visible: det.face_visible !== undefined ? det.face_visible : true,
        face_confidence: det.face_confidence ?? 0.88,
        phone_detected: det.phone_detected ?? false,
        phone_confidence: det.phone_confidence ?? 0,
        movement_magnitude: 0,
        is_moving: false,
        seat_id: det.seat_id,
        associated_student_id: det.associated_student_id,
        suspicion_score: 5,
        last_seen_timestamp: now,
        created_timestamp: now,
        missed_frames: 0,
        history: [{ x: det.bbox.x + det.bbox.width / 2, y: det.bbox.y + det.bbox.height / 2, t: now }]
      };
      this.active_tracks.set(newTrackId, newTrack);
    }

    // Step 3: Handle lost tracks & prune stale ones
    for (const [trackId, track] of this.active_tracks.entries()) {
      if (!matchedTrackIds.has(trackId)) {
        track.missed_frames++;
        if (track.missed_frames > this.max_missed_frames) {
          this.active_tracks.delete(trackId);
        }
      }
    }

    // Convert internal states to public CameraTrack interface
    return Array.from(this.active_tracks.values()).map(t => ({
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
      seat_id: t.seat_id,
      associated_student_id: t.associated_student_id,
      suspicion_score: t.suspicion_score,
      last_seen_timestamp: t.last_seen_timestamp,
      created_timestamp: t.created_timestamp,
      history_trajectory: [...t.history]
    }));
  }

  /**
   * Reset tracker context (e.g., when camera disconnects or restarts).
   */
  public reset(): void {
    this.active_tracks.clear();
    this.next_track_number = 1;
  }

  /**
   * Update suspicion score for a track inside this camera tracker.
   */
  public setTrackSuspicion(track_id: string, score: number): void {
    const track = this.active_tracks.get(track_id);
    if (track) {
      track.suspicion_score = score;
    }
  }

  public getTrackCount(): number {
    return this.active_tracks.size;
  }
}
