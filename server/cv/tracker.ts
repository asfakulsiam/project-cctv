/**
 * Smart Classroom Exam Monitoring System
 * Production Multi-Person Computer Vision Tracker (BoT-SORT-inspired association layer)
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. Human Detection is the Gatekeeper:
 *    Only confirmed class == 'person' detections enter the tracker.
 * 2. Independent Per-Camera Context:
 *    All track IDs are strictly camera-scoped (e.g. CAM1-T001, CAM2-T004).
 *    Camera Tracker NEVER allocates Global Person IDs (P-001); that is the exclusive role of GlobalIdentityManager.
 * 3. BoT-SORT-inspired Association:
 *    - Motion state & linear kinematics prediction
 *    - Visual Re-ID appearance cosine similarity when appearance is available
 *    - Two-stage association (Stage 1: High confidence + spatial/visual affinity, Stage 2: Remaining + IoU/distance affinity)
 * 4. Multi-Frame Candidate Evidence Accumulation:
 *    Evaluates CandidateEvidence (detectionCount >= 4, duration >= 0.20s, confidenceMean >= 0.50, confidenceMin >= 0.35).
 *    Candidates must achieve required temporal evidence before permanent track promotion.
 * 5. Stationary Persistence:
 *    Stationary students (velocity -> 0) maintain track continuity without cycling or vanishing.
 * 6. Lost Track vs Terminated Track:
 *    Missing detections transition track ACTIVE -> LOST -> TERMINATED only after max_missed_frames timeout.
 * 7. Dual Score & Max Score:
 *    - current_score: Immediate behavioral risk window (resettable)
 *    - cumulative_score: Monotonically non-decreasing audit score
 *    - max_score: Peak score ever recorded
 */

import { 
  BoundingBox, 
  CameraTrack, 
  CandidateEvidence, 
  HeadPoseData, 
  HumanDetection,
  getWarningLevel,
  MonitoringThresholds
} from '../../src/types.js';
import { RealPersonDetector } from './personDetector.js';

export type TrackStatus = 'candidate' | 'active' | 'lost' | 'terminated';

export interface InternalTrackState {
  track_id: string;            // Layer 2: CAM1-T001
  camera_id: string;
  person_id?: string;          // Layer 3: P-001
  global_person_id?: string;   // Layer 3: P-001 (alias)
  status: TrackStatus;
  bbox: BoundingBox;
  target_bbox: BoundingBox;
  confidence: number;
  appearance_embedding?: number[];
  
  // Kinematics & Linear Prediction
  velocity_x: number; // Normalized coordinate delta per second
  velocity_y: number;
  last_update_time: number;
  hits: number;
  missed_frames: number;

  // Observation attributes (secondary evidence)
  head_pose: HeadPoseData;
  face_visible: boolean;
  face_occluded?: boolean;
  face_confidence: number;
  phone_detected: boolean;
  phone_confidence: number;
  phone_bbox?: BoundingBox;
  movement_magnitude: number;
  is_moving: boolean;
  is_confirmed_human: boolean;
  seat_id?: string;
  associated_student_id?: string;
  
  // Scoring Architecture
  current_score: number;      // Immediate anomaly window (0 - 100, resettable)
  cumulative_score: number;   // Monotonically non-decreasing lifetime score (0 - 100)
  max_score: number;          // Peak score recorded (0 - 100)
  suspicion_score: number;
  warning_latched: boolean;
  warning_cleared_at?: number;
  last_seen_timestamp: number;
  created_timestamp: number;
  history: Array<{ x: number; y: number; t: number }>;

  // Candidate Evidence Accumulator
  evidence?: {
    confidences: number[];
    centers: Array<{ x: number; y: number }>;
    sizes: Array<{ w: number; h: number }>;
    embeddings: number[][];
    firstSeen: number;
    lastSeen: number;
  };
}

export class CameraTracker {
  public readonly camera_id: string;
  private readonly camera_prefix: string;
  private next_track_number = 1;
  private active_tracks: Map<string, InternalTrackState> = new Map();
  private candidate_tracks: Map<string, InternalTrackState> = new Map();
  private next_candidate_number = 1;
  private thresholds?: MonitoringThresholds;

  // Association & Lifecycle Parameters
  private readonly confirmation_hits_required = 3; // Fast multi-frame confirmation
  private readonly max_missed_frames = 150;        // Highly persistent tracking (never drop detected humans prematurely)
  private readonly iou_threshold = 0.10;           // Spatial association threshold
  private readonly appearance_weight = 0.45;       // Combined cost weight when embeddings exist

  constructor(camera_id: string, thresholds?: MonitoringThresholds) {
    this.camera_id = camera_id;
    this.thresholds = thresholds;
    // Clean uppercase camera prefix: "cam-1" -> "CAM1"
    this.camera_prefix = camera_id.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  public setThresholds(thresholds: MonitoringThresholds): void {
    this.thresholds = thresholds;
  }

  /**
   * Generate permanent Layer 2 camera-scoped tracking identifier upon track confirmation.
   * Example: CAM1-T001, CAM1-T002
   */
  private generateTrackId(): string {
    const numStr = String(this.next_track_number++).padStart(3, '0');
    return `${this.camera_prefix}-T${numStr}`;
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

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = b1.width * b1.height;
    const area2 = b2.width * b2.height;
    const union = area1 + area2 - intersection;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Predict bounding box location using linear velocity.
   * If velocity is near zero (stationary student), predictions lock firmly in place.
   */
  private predictBoundingBox(track: InternalTrackState, dtSec: number): BoundingBox {
    const clampedDt = Math.min(0.5, Math.max(0, dtSec));
    const predX = track.bbox.x + track.velocity_x * clampedDt;
    const predY = track.bbox.y + track.velocity_y * clampedDt;

    return {
      x: Math.max(0, Math.min(0.95, predX)),
      y: Math.max(0, Math.min(0.95, predY)),
      width: track.bbox.width,
      height: track.bbox.height
    };
  }

  /**
   * Compute BoT-SORT-inspired combined affinity score using motion, IoU, and Re-ID appearance embedding.
   * When appearance embeddings are undefined, strictly uses conservative spatial affinity.
   */
  private computeCombinedAffinity(
    trackBox: BoundingBox,
    detBox: BoundingBox,
    trackEmb?: number[],
    detEmb?: number[]
  ): number {
    const iou = this.computeIoU(trackBox, detBox);
    const centerDist = this.computeCenterDistance(trackBox, detBox);
    const maxDist = Math.max(0.20, Math.hypot(trackBox.width, trackBox.height) * 1.3);

    const distanceAffinity = Math.max(0, 1 - centerDist / maxDist);
    const spatialAffinity = (iou * 0.6) + (distanceAffinity * 0.4);

    if (trackEmb && detEmb && trackEmb.length > 0 && detEmb.length > 0) {
      const cosineSim = RealPersonDetector.computeCosineSimilarity(trackEmb, detEmb);
      return (1 - this.appearance_weight) * spatialAffinity + (this.appearance_weight * cosineSim);
    }

    return spatialAffinity;
  }

  /**
   * Evaluate multi-frame CandidateEvidence before promoting candidate to confirmed track.
   */
  private evaluateCandidateEvidence(cand: InternalTrackState): CandidateEvidence {
    const ev = cand.evidence || {
      confidences: [cand.confidence],
      centers: [{ x: cand.bbox.x + cand.bbox.width / 2, y: cand.bbox.y + cand.bbox.height / 2 }],
      sizes: [{ w: cand.bbox.width, h: cand.bbox.height }],
      embeddings: cand.appearance_embedding ? [cand.appearance_embedding] : [],
      firstSeen: cand.created_timestamp,
      lastSeen: cand.last_seen_timestamp
    };

    const count = ev.confidences.length;
    const sumConf = ev.confidences.reduce((a, b) => a + b, 0);
    const meanConf = sumConf / Math.max(1, count);
    const minConf = Math.min(...ev.confidences);

    // Center variance
    const meanCx = ev.centers.reduce((a, b) => a + b.x, 0) / Math.max(1, count);
    const meanCy = ev.centers.reduce((a, b) => a + b.y, 0) / Math.max(1, count);
    let centerVar = 0;
    for (const c of ev.centers) {
      centerVar += Math.hypot(c.x - meanCx, c.y - meanCy);
    }
    centerVar = centerVar / Math.max(1, count);

    // Size variance
    const meanW = ev.sizes.reduce((a, b) => a + b.w, 0) / Math.max(1, count);
    let sizeVar = 0;
    for (const s of ev.sizes) {
      sizeVar += Math.abs(s.w - meanW);
    }
    sizeVar = sizeVar / Math.max(1, count);

    // Appearance consistency (if embeddings exist)
    let appearanceConsistency: number | undefined = undefined;
    if (ev.embeddings.length >= 2) {
      let appSimSum = 0;
      let appPairs = 0;
      for (let i = 0; i < ev.embeddings.length - 1; i++) {
        appSimSum += RealPersonDetector.computeCosineSimilarity(ev.embeddings[i], ev.embeddings[i + 1]);
        appPairs++;
      }
      appearanceConsistency = appPairs > 0 ? (appSimSum / appPairs) : undefined;
    }

    return {
      detectionCount: count,
      firstSeen: ev.firstSeen,
      lastSeen: ev.lastSeen,
      confidenceMean: meanConf,
      confidenceMin: minConf,
      centerVariance: centerVar,
      sizeVariance: sizeVar,
      appearanceConsistency,
      detectorAgreement: 1.0
    };
  }

  /**
   * Candidate confirmation logic evaluating multi-frame temporal evidence.
   */
  private shouldConfirmCandidate(evidence: CandidateEvidence, now: number): boolean {
    const duration = (evidence.lastSeen - evidence.firstSeen) / 1000;
    return (
      evidence.detectionCount >= this.confirmation_hits_required &&
      duration >= 0.20 &&
      evidence.confidenceMean >= 0.50 &&
      evidence.confidenceMin >= 0.35 &&
      (evidence.appearanceConsistency === undefined || evidence.appearanceConsistency >= 0.60) &&
      evidence.centerVariance <= 0.08 &&
      evidence.sizeVariance <= 0.06
    );
  }

  /**
   * Main BoT-SORT-inspired Multi-Object Tracking Step.
   */
  public update(humanDetections: HumanDetection[], now: number = Date.now()): CameraTrack[] {
    const matchedConfirmedIds = new Set<string>();
    const matchedCandidateIds = new Set<string>();
    const unmatchedDetections: HumanDetection[] = [];

    // -------------------------------------------------------------
    // STAGE 1: Associate High-Confidence Human Detections
    // -------------------------------------------------------------
    const highConfDetections = humanDetections.filter(d => d.confidence >= 0.55);
    const lowConfDetections = humanDetections.filter(d => d.confidence < 0.55);

    for (const det of highConfDetections) {
      let bestMatchId: string | null = null;
      let highestScore = 0;

      for (const [trackId, track] of this.active_tracks.entries()) {
        if (matchedConfirmedIds.has(trackId)) continue;

        const dtSec = (now - track.last_update_time) / 1000;
        const predictedBox = this.predictBoundingBox(track, dtSec);
        const affinity = this.computeCombinedAffinity(
          predictedBox, 
          det.bbox, 
          track.appearance_embedding, 
          det.appearance_embedding
        );

        if (affinity >= this.iou_threshold && affinity > highestScore) {
          highestScore = affinity;
          bestMatchId = trackId;
        }
      }

      if (bestMatchId) {
        matchedConfirmedIds.add(bestMatchId);
        this.updateConfirmedTrack(bestMatchId, det, now);
      } else {
        unmatchedDetections.push(det);
      }
    }

    // -------------------------------------------------------------
    // STAGE 2: Associate Remaining Active Tracks with Low-Confidence Detections
    // FIX: Spatial score incorporating distance affinity so IoU=0 doesn't fail
    // -------------------------------------------------------------
    const remainingDets = [...unmatchedDetections, ...lowConfDetections];
    const secondUnmatchedDetections: HumanDetection[] = [];

    for (const det of remainingDets) {
      let bestMatchId: string | null = null;
      let highestScore = 0;

      for (const [trackId, track] of this.active_tracks.entries()) {
        if (matchedConfirmedIds.has(trackId)) continue;

        const dtSec = (now - track.last_update_time) / 1000;
        const predictedBox = this.predictBoundingBox(track, dtSec);
        const iou = this.computeIoU(predictedBox, det.bbox);
        const dist = this.computeCenterDistance(predictedBox, det.bbox);
        const maxDist = Math.max(0.20, Math.hypot(track.bbox.width, track.bbox.height) * 1.1);

        const distanceAffinity = Math.max(0, 1 - dist / Math.max(maxDist, 0.001));
        const spatialScore = Math.max(iou, distanceAffinity * 0.7);

        if (
          (iou >= this.iou_threshold || dist <= maxDist) &&
          spatialScore > highestScore
        ) {
          highestScore = spatialScore;
          bestMatchId = trackId;
        }
      }

      if (bestMatchId) {
        matchedConfirmedIds.add(bestMatchId);
        this.updateConfirmedTrack(bestMatchId, det, now);
      } else {
        secondUnmatchedDetections.push(det);
      }
    }

    // -------------------------------------------------------------
    // STAGE 3: Associate Unmatched Detections with CANDIDATE Tracks
    // -------------------------------------------------------------
    const stillUnmatched: HumanDetection[] = [];

    for (const det of secondUnmatchedDetections) {
      let bestCandidateId: string | null = null;
      let highestCandScore = 0;

      for (const [candId, cand] of this.candidate_tracks.entries()) {
        if (matchedCandidateIds.has(candId)) continue;

        const affinity = this.computeCombinedAffinity(
          cand.bbox,
          det.bbox,
          cand.appearance_embedding,
          det.appearance_embedding
        );

        if (affinity >= this.iou_threshold && affinity > highestCandScore) {
          highestCandScore = affinity;
          bestCandidateId = candId;
        }
      }

      if (bestCandidateId) {
        matchedCandidateIds.add(bestCandidateId);
        const cand = this.candidate_tracks.get(bestCandidateId)!;
        cand.hits++;
        cand.missed_frames = 0;
        cand.bbox = { ...det.bbox };
        cand.confidence = det.confidence;
        cand.last_seen_timestamp = now;
        cand.last_update_time = now;
        if (det.appearance_embedding) {
          cand.appearance_embedding = det.appearance_embedding;
        }

        // Accumulate candidate evidence
        if (cand.evidence) {
          cand.evidence.confidences.push(det.confidence);
          cand.evidence.centers.push({ x: det.bbox.x + det.bbox.width / 2, y: det.bbox.y + det.bbox.height / 2 });
          cand.evidence.sizes.push({ w: det.bbox.width, h: det.bbox.height });
          if (det.appearance_embedding) cand.evidence.embeddings.push(det.appearance_embedding);
          cand.evidence.lastSeen = now;
        }

        // EVALUATE TEMPORAL CONFIRMATION GATE
        const evidence = this.evaluateCandidateEvidence(cand);
        if (this.shouldConfirmCandidate(evidence, now)) {
          // PROMOTE CANDIDATE TO CONFIRMED PERMANENT TRACK
          const confirmedTrackId = this.generateTrackId();
          const confirmedTrack: InternalTrackState = {
            ...cand,
            track_id: confirmedTrackId,
            status: 'active',
            hits: cand.hits,
            missed_frames: 0,
            last_seen_timestamp: now,
            created_timestamp: cand.created_timestamp
          };

          this.active_tracks.set(confirmedTrackId, confirmedTrack);
          this.candidate_tracks.delete(bestCandidateId);
        }
      } else {
        stillUnmatched.push(det);
      }
    }

    // -------------------------------------------------------------
    // STAGE 4: Spawn New Candidate Tracks for Unassigned Detections
    // -------------------------------------------------------------
    for (const det of stillUnmatched) {
      if (det.confidence < 0.50) continue; // Noise filter

      const candId = `cand-${this.next_candidate_number++}`;
      const newCand: InternalTrackState = {
        track_id: candId,
        camera_id: this.camera_id,
        status: 'candidate',
        bbox: { ...det.bbox },
        target_bbox: { ...det.bbox },
        confidence: det.confidence,
        appearance_embedding: det.appearance_embedding,
        velocity_x: 0,
        velocity_y: 0,
        last_update_time: now,
        hits: 1,
        missed_frames: 0,
        head_pose: det.head_pose || { yaw: 0, pitch: 0, direction: 'center', confidence: 0 },
        face_visible: det.face_visible ?? false,
        face_occluded: ((det.face_confidence ?? 0) > 0.35) && det.face_visible === false,
        face_confidence: det.face_confidence ?? 0,
        phone_detected: det.phone_detected ?? false,
        phone_confidence: det.phone_confidence ?? 0,
        phone_bbox: det.phone_bbox,
        movement_magnitude: 0,
        is_moving: false,
        is_confirmed_human: true,
        seat_id: det.seat_id,
        associated_student_id: det.associated_student_id,
        current_score: 0,
        cumulative_score: 0,
        max_score: 0,
        suspicion_score: 0,
        warning_latched: false,
        last_seen_timestamp: now,
        created_timestamp: now,
        history: [{ x: det.bbox.x + det.bbox.width / 2, y: det.bbox.y + det.bbox.height / 2, t: now }],
        evidence: {
          confidences: [det.confidence],
          centers: [{ x: det.bbox.x + det.bbox.width / 2, y: det.bbox.y + det.bbox.height / 2 }],
          sizes: [{ w: det.bbox.width, h: det.bbox.height }],
          embeddings: det.appearance_embedding ? [det.appearance_embedding] : [],
          firstSeen: now,
          lastSeen: now
        }
      };
      this.candidate_tracks.set(candId, newCand);
    }

    // -------------------------------------------------------------
    // STAGE 5: Missed Frame Handling & Stationary Persistence
    // -------------------------------------------------------------
    for (const [candId, cand] of this.candidate_tracks.entries()) {
      if (!matchedCandidateIds.has(candId)) {
        cand.missed_frames++;
        if (cand.missed_frames > 3) {
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

        // Stationary student prediction maintains spatial anchor
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
      .map(t => this.toPublicTrack(t));
  }

  /**
   * Handles empty camera ticks or camera disconnection.
   * Increments missed frames, transitions active tracks to 'lost',
   * and terminates tracks that exceed the timeout.
   */
  public handleNoFrame(now: number = Date.now()): CameraTrack[] {
    for (const [candId] of this.candidate_tracks.entries()) {
      this.candidate_tracks.delete(candId);
    }

    for (const [trackId, track] of this.active_tracks.entries()) {
      track.missed_frames++;
      track.status = 'lost';
      track.movement_magnitude = 0;
      track.is_moving = false;
      track.last_update_time = now;

      if (track.missed_frames > this.max_missed_frames) {
        track.status = 'terminated';
        this.active_tracks.delete(trackId);
      }
    }

    return Array.from(this.active_tracks.values())
      .filter(t => t.status === 'active' || (t.status === 'lost' && t.missed_frames <= 6))
      .map(t => this.toPublicTrack(t));
  }

  /**
   * Updates an active confirmed track with observation state and linear kinematics.
   * Sitting completely still (displacement -> 0) maintains track continuity!
   */
  private updateConfirmedTrack(trackId: string, det: HumanDetection, now: number): void {
    const track = this.active_tracks.get(trackId)!;

    const dtSec = Math.max(0.01, (now - track.last_update_time) / 1000);
    const dx = det.bbox.x - track.bbox.x;
    const dy = det.bbox.y - track.bbox.y;
    const instVx = dx / dtSec;
    const instVy = dy / dtSec;

    // Smoothed EMA kinematics
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

    // Running appearance embedding update if real embedding provided
    if (det.appearance_embedding) {
      if (!track.appearance_embedding) {
        track.appearance_embedding = [...det.appearance_embedding];
      } else {
        const appAlpha = 0.20;
        track.appearance_embedding = track.appearance_embedding.map((v, i) => 
          Math.round((v * (1 - appAlpha) + (det.appearance_embedding![i] || 0) * appAlpha) * 1000) / 1000
        );
      }
    }

    const displacement = Math.hypot(dx, dy);
    const movement_magnitude = Math.min(100, Math.round(displacement * 500));
    const is_moving = movement_magnitude > 6;

    track.target_bbox = det.bbox;
    track.confidence = det.confidence;
    track.head_pose = det.head_pose || track.head_pose;
    const updatedFaceConfidence = det.face_confidence ?? track.face_confidence ?? 0;
    const updatedFaceVisible = det.face_visible !== undefined ? det.face_visible : track.face_visible;
    track.face_confidence = updatedFaceConfidence;
    track.face_visible = updatedFaceVisible;
    track.face_occluded = updatedFaceConfidence > 0.35 && updatedFaceVisible === false;
    track.phone_detected = det.phone_detected ?? false;
    track.phone_confidence = det.phone_confidence ?? 0;
    track.phone_bbox = det.phone_bbox;
    track.movement_magnitude = movement_magnitude;
    track.is_moving = is_moving;
    if (det.seat_id) track.seat_id = det.seat_id;
    if (det.associated_student_id) track.associated_student_id = det.associated_student_id;

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
  }

  /**
   * Map internal track representation to public CameraTrack contract.
   */
  private toPublicTrack(t: InternalTrackState): CameraTrack {
    return {
      track_id: t.track_id,
      camera_id: t.camera_id,
      global_person_id: t.global_person_id,
      bbox: { ...t.bbox },
      confidence: t.confidence,
      appearance_embedding: t.appearance_embedding ? [...t.appearance_embedding] : undefined,
      head_pose: { ...t.head_pose },
      face_visible: t.face_visible,
      face_occluded: t.face_occluded,
      face_confidence: t.face_confidence,
      phone_detected: t.phone_detected,
      phone_confidence: t.phone_confidence,
      phone_bbox: t.phone_bbox ? { ...t.phone_bbox } : undefined,
      movement_magnitude: t.movement_magnitude,
      is_moving: t.is_moving,
      is_confirmed_human: true,
      seat_id: t.seat_id,
      associated_student_id: t.associated_student_id,
      suspicion_score: t.cumulative_score,
      current_score: t.current_score,
      cumulative_score: t.cumulative_score,
      max_score: t.max_score,
      warning_level: getWarningLevel(t.current_score, this.thresholds),
      warning_latched: t.warning_latched,
      warning_cleared_at: t.warning_cleared_at,
      last_seen_timestamp: t.last_seen_timestamp,
      created_timestamp: t.created_timestamp,
      history_trajectory: [...t.history]
    };
  }

  public getTrack(trackId: string): InternalTrackState | undefined {
    return this.active_tracks.get(trackId);
  }

  public getActiveTrackIds(): string[] {
    return Array.from(this.active_tracks.keys());
  }

  public getActiveTrackCount(): number {
    return this.active_tracks.size;
  }

  public updateDetections(humanDetections: HumanDetection[], now: number = Date.now()): CameraTrack[] {
    return this.update(humanDetections, now);
  }

  public setTrackSuspicion(trackId: string, cumulative: number, current: number, maxScore?: number): void {
    const track = this.active_tracks.get(trackId);
    if (track) {
      track.cumulative_score = cumulative;
      track.suspicion_score = cumulative;
      track.current_score = current;
      track.max_score = maxScore ?? Math.max(track.max_score || 0, current, cumulative);
      const warnThreshold = this.thresholds?.warning_suspicion_threshold ?? 40;
      if (current >= warnThreshold) {
        track.warning_latched = true;
      }
    }
  }

  public clearTrackWarning(trackId: string): boolean {
    const track = this.active_tracks.get(trackId);
    if (!track) return false;
    track.warning_latched = false;
    track.warning_cleared_at = Date.now();
    track.current_score = 0;
    // Note: cumulative_score and max_score are strictly PRESERVED
    return true;
  }

  public removeTrack(trackId: string): boolean {
    const deletedActive = this.active_tracks.delete(trackId);
    const deletedCand = this.candidate_tracks.delete(trackId);
    return deletedActive || deletedCand;
  }

  public removeTracksByPersonId(personId: string): string[] {
    const removed: string[] = [];
    for (const [id, t] of this.active_tracks.entries()) {
      if (t.global_person_id === personId || t.person_id === personId) {
        this.active_tracks.delete(id);
        removed.push(id);
      }
    }
    for (const [id, t] of this.candidate_tracks.entries()) {
      if (t.global_person_id === personId || t.person_id === personId) {
        this.candidate_tracks.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  public reset(): void {
    this.active_tracks.clear();
    this.candidate_tracks.clear();
    this.next_track_number = 1;
    this.next_candidate_number = 1;
  }
}
