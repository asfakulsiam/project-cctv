/**
 * Smart Classroom Exam Monitoring System
 * Temporal Behavioral Analysis & Suspicion Scoring Engine
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. Suspicion is represented strictly as a "Suspicion Score" or "Monitoring Score" (0 - 100),
 *    NEVER as a definitive accusation of academic dishonesty.
 * 2. Missing/Unknown Secondary Evidence:
 *    If face detector or pose estimator is not active (confidence <= 0.35),
 *    distinguish FACE_UNKNOWN from FACE_NOT_VISIBLE. Never penalize a student
 *    simply because secondary biometric hardware/model is absent.
 * 3. Event Deduplication & Cooldowns:
 *    Events are not emitted every frame; score contribution reflects discrete behavioral anomalies.
 * 4. Dual Suspicion Scores + Max Score:
 *    - current_score: Immediate active anomaly state (resettable, decays to 0)
 *    - cumulative_score: Monotonically non-decreasing audit trail of accumulated behavioral evidence
 *    - max_score: Peak instantaneous current_score reached
 * 5. Explainable Audit Trail:
 *    All emitted events include evidence (confidence, duration, bounding box, score contribution).
 */

import { 
  BehaviorEvent, 
  BehaviorEventType, 
  CameraTrack, 
  EventSeverity, 
  MonitoringThresholds, 
  SuspicionWeights 
} from '../../src/types.js';

interface TrackTemporalContext {
  // Head pose tracking
  current_direction: 'center' | 'left' | 'right' | 'up' | 'down';
  direction_started_at: number;
  looking_alert_fired: boolean;
  looking_turn_count: number;
  last_turn_timestamp: number;
  last_repeated_looking_event_time: number;

  // Face visibility tracking
  face_missing_since: number | null;
  face_missing_alert_fired: boolean;

  // Phone persistence tracking
  phone_detected_since: number | null;
  last_phone_alert_time: number;

  // Seat status tracking
  is_out_of_seat: boolean;
  left_seat_since: number | null;
  left_seat_alert_fired: boolean;

  // Movement velocity history
  velocity_spikes: number;
  last_abnormal_movement_time: number;

  // Active behavioral penalties
  active_penalties: {
    looking_turn: number;
    face_obscured: number;
    phone_present: number;
    out_of_seat: number;
    abnormal_motion: number;
  };
}

export class BehaviorAnalyzer {
  private thresholds: MonitoringThresholds;
  private weights: SuspicionWeights;
  private track_contexts: Map<string, TrackTemporalContext> = new Map(); // track_id -> context
  private session_id: string;

  constructor(session_id: string, thresholds: MonitoringThresholds, weights: SuspicionWeights) {
    this.session_id = session_id;
    this.thresholds = thresholds;
    this.weights = weights;
  }

  public updateConfig(thresholds: MonitoringThresholds, weights: SuspicionWeights): void {
    this.thresholds = thresholds;
    this.weights = weights;
  }

  private getOrCreateContext(track_id: string, now: number): TrackTemporalContext {
    let ctx = this.track_contexts.get(track_id);
    if (!ctx) {
      ctx = {
        current_direction: 'center',
        direction_started_at: now,
        looking_alert_fired: false,
        looking_turn_count: 0,
        last_turn_timestamp: now,
        last_repeated_looking_event_time: 0,
        face_missing_since: null,
        face_missing_alert_fired: false,
        phone_detected_since: null,
        last_phone_alert_time: 0,
        is_out_of_seat: false,
        left_seat_since: null,
        left_seat_alert_fired: false,
        velocity_spikes: 0,
        last_abnormal_movement_time: 0,
        active_penalties: {
          looking_turn: 0,
          face_obscured: 0,
          phone_present: 0,
          out_of_seat: 0,
          abnormal_motion: 0
        }
      };
      this.track_contexts.set(track_id, ctx);
    }
    return ctx;
  }

  /**
   * Evaluates a live track against behavioral heuristics and temporal filters.
   * Returns newly triggered events (if any) and the updated explainable suspicion scores.
   */
  public analyzeTrack(
    track: CameraTrack,
    seatRegion?: { x: number; y: number; width: number; height: number },
    now: number = Date.now()
  ): { events: BehaviorEvent[]; suspicion_score: number; current_score: number; cumulative_score: number; max_score: number } {
    const ctx = this.getOrCreateContext(track.track_id, now);
    const triggeredEvents: BehaviorEvent[] = [];

    // -------------------------------------------------------------
    // 1. Head Pose & Gaze Direction Analysis
    // ONLY analyze if pose estimator provided valid confidence (> 0.35)
    // -------------------------------------------------------------
    const hasValidPoseEvidence = track.head_pose && track.head_pose.confidence > 0.35;
    if (hasValidPoseEvidence) {
      const currentDir = track.head_pose.direction;
      if (currentDir !== ctx.current_direction) {
        if (currentDir === 'left' || currentDir === 'right') {
          ctx.looking_turn_count++;
          ctx.last_turn_timestamp = now;
        }
        ctx.current_direction = currentDir;
        ctx.direction_started_at = now;
        ctx.looking_alert_fired = false;
      } else if (currentDir === 'left' || currentDir === 'right') {
        const sustainedDurationSec = (now - ctx.direction_started_at) / 1000;
        if (sustainedDurationSec >= this.thresholds.looking_duration_sec && !ctx.looking_alert_fired) {
          ctx.looking_alert_fired = true;
          ctx.active_penalties.looking_turn = this.weights.repeated_looking;

          const eventType: BehaviorEventType = currentDir === 'left' ? 'LOOKING_LEFT' : 'LOOKING_RIGHT';
          triggeredEvents.push(this.createEvent({
            event_type: eventType,
            camera_id: track.camera_id,
            track_id: track.track_id,
            global_person_id: track.global_person_id || track.person_id,
            confidence: track.head_pose.confidence,
            score_contribution: this.weights.repeated_looking,
            severity: 'warning',
            description: `Sustained gaze direction to ${currentDir} (${sustainedDurationSec.toFixed(1)}s)`,
            duration_ms: Math.round(sustainedDurationSec * 1000),
            track
          }, now));
        }
      } else {
        // Facing center or downwards (normal exam writing)
        ctx.active_penalties.looking_turn = Math.max(0, ctx.active_penalties.looking_turn - 1);
      }

      // Repeated glancing heuristic: 4+ head turns within 35 seconds
      const glanceWindowSec = (now - ctx.last_turn_timestamp) / 1000;
      if (glanceWindowSec > 35) {
        ctx.looking_turn_count = Math.max(0, ctx.looking_turn_count - 1);
      }
      if (ctx.looking_turn_count >= 4 && (now - ctx.last_repeated_looking_event_time) > 25000) {
        ctx.last_repeated_looking_event_time = now;
        ctx.looking_turn_count = 1; // Reset counter after firing
        triggeredEvents.push(this.createEvent({
          event_type: 'REPEATED_LOOKING',
          camera_id: track.camera_id,
          track_id: track.track_id,
          global_person_id: track.global_person_id || track.person_id,
          confidence: track.head_pose.confidence,
          score_contribution: this.weights.repeated_looking,
          severity: 'warning',
          description: 'Frequent intermittent head glancing detected across adjacent desks',
          duration_ms: Math.round(glanceWindowSec * 1000),
          track
        }, now));
      }
    } else {
      // Pose evidence unknown - do not penalize
      ctx.active_penalties.looking_turn = Math.max(0, ctx.active_penalties.looking_turn - 1);
    }

    // -------------------------------------------------------------
    // 2. Face Visibility & Occlusion Analysis
    // MUST have active face detector confidence (> 0.35) before penalizing!
    // -------------------------------------------------------------
    const hasValidFaceEvidence = track.face_confidence > 0.35;
    if (hasValidFaceEvidence && !track.face_visible) {
      if (!ctx.face_missing_since) {
        ctx.face_missing_since = now;
      }
      const obscuredDurationSec = (now - ctx.face_missing_since) / 1000;
      if (obscuredDurationSec >= this.thresholds.face_hidden_duration_sec && !ctx.face_missing_alert_fired) {
        ctx.face_missing_alert_fired = true;
        ctx.active_penalties.face_obscured = this.weights.face_hidden;
        triggeredEvents.push(this.createEvent({
          event_type: 'FACE_NOT_VISIBLE',
          camera_id: track.camera_id,
          track_id: track.track_id,
          global_person_id: track.global_person_id || track.person_id,
          confidence: track.face_confidence,
          score_contribution: this.weights.face_hidden,
          severity: 'warning',
          description: `Facial features occluded or obscured from camera view for ${obscuredDurationSec.toFixed(1)}s`,
          duration_ms: Math.round(obscuredDurationSec * 1000),
          track
        }, now));
      }
    } else {
      ctx.face_missing_since = null;
      ctx.face_missing_alert_fired = false;
      ctx.active_penalties.face_obscured = Math.max(0, ctx.active_penalties.face_obscured - 2);
    }

    // -------------------------------------------------------------
    // 3. Mobile Device / Electronic Object Detection
    // -------------------------------------------------------------
    if (track.phone_detected && track.phone_confidence >= this.thresholds.phone_confidence_min) {
      if (!ctx.phone_detected_since) {
        ctx.phone_detected_since = now;
      }
      const phoneDurationSec = (now - ctx.phone_detected_since) / 1000;
      const cooldownElapsed = (now - ctx.last_phone_alert_time) > 20000;

      if (phoneDurationSec >= 1.5 && cooldownElapsed) {
        ctx.last_phone_alert_time = now;
        ctx.active_penalties.phone_present = this.weights.phone_detected;
        triggeredEvents.push(this.createEvent({
          event_type: 'PHONE_DETECTED',
          camera_id: track.camera_id,
          track_id: track.track_id,
          global_person_id: track.global_person_id || track.person_id,
          confidence: track.phone_confidence,
          score_contribution: this.weights.phone_detected,
          severity: 'high',
          description: `Mobile communication device detected with ${(track.phone_confidence * 100).toFixed(0)}% confidence`,
          duration_ms: Math.round(phoneDurationSec * 1000),
          track
        }, now));
      }
    } else {
      ctx.phone_detected_since = null;
      ctx.active_penalties.phone_present = Math.max(0, ctx.active_penalties.phone_present - 1);
    }

    // -------------------------------------------------------------
    // 4. Seat Boundary & Leaving Seat Analysis
    // -------------------------------------------------------------
    if (seatRegion) {
      const footX = track.bbox.x + track.bbox.width / 2;
      const footY = track.bbox.y + track.bbox.height * 0.88;
      const margin = 0.04;
      const insideSeat = 
        footX >= (seatRegion.x - margin) &&
        footX <= (seatRegion.x + seatRegion.width + margin) &&
        footY >= (seatRegion.y - margin) &&
        footY <= (seatRegion.y + seatRegion.height + margin);

      if (!insideSeat) {
        if (!ctx.left_seat_since) {
          ctx.left_seat_since = now;
        }
        const leftDurationSec = (now - ctx.left_seat_since) / 1000;
        if (leftDurationSec >= this.thresholds.leave_seat_grace_sec && !ctx.left_seat_alert_fired) {
          ctx.left_seat_alert_fired = true;
          ctx.is_out_of_seat = true;
          ctx.active_penalties.out_of_seat = this.weights.leaving_seat;
          const leftConf = Math.min(1.0, 0.75 + Math.min(0.20, (leftDurationSec - this.thresholds.leave_seat_grace_sec) * 0.05));
          triggeredEvents.push(this.createEvent({
            event_type: 'LEFT_SEAT',
            camera_id: track.camera_id,
            track_id: track.track_id,
            global_person_id: track.global_person_id || track.person_id,
            confidence: leftConf,
            score_contribution: this.weights.leaving_seat,
            severity: 'high',
            description: `Candidate departed configured workstation desk for ${leftDurationSec.toFixed(1)}s`,
            duration_ms: Math.round(leftDurationSec * 1000),
            track
          }, now));
        }
      } else {
        if (ctx.is_out_of_seat) {
          // Returned to seat
          ctx.is_out_of_seat = false;
          ctx.left_seat_alert_fired = false;
          ctx.left_seat_since = null;
          ctx.active_penalties.out_of_seat = 0;
          triggeredEvents.push(this.createEvent({
            event_type: 'RETURNED_TO_SEAT',
            camera_id: track.camera_id,
            track_id: track.track_id,
            global_person_id: track.global_person_id || track.person_id,
            confidence: 0.90,
            score_contribution: -15,
            severity: 'info',
            description: 'Candidate returned to assigned workstation',
            track
          }, now));
        } else {
          ctx.left_seat_since = null;
        }
      }
    }

    // -------------------------------------------------------------
    // 5. Abnormal Rapid Movement / Agitation
    // -------------------------------------------------------------
    if (track.movement_magnitude > this.thresholds.movement_threshold_px * 2) {
      if ((now - ctx.last_abnormal_movement_time) > 15000) {
        ctx.last_abnormal_movement_time = now;
        ctx.active_penalties.abnormal_motion = this.weights.abnormal_movement;
        const moveConf = Math.min(0.95, Math.max(0.60, track.movement_magnitude / 100));
        triggeredEvents.push(this.createEvent({
          event_type: 'ABNORMAL_MOVEMENT',
          camera_id: track.camera_id,
          track_id: track.track_id,
          global_person_id: track.global_person_id || track.person_id,
          confidence: moveConf,
          score_contribution: this.weights.abnormal_movement,
          severity: 'warning',
          description: `Rapid agitation/movement detected (magnitude ${track.movement_magnitude})`,
          track
        }, now));
      }
    } else {
      ctx.active_penalties.abnormal_motion = Math.max(0, ctx.active_penalties.abnormal_motion - 1);
    }

    // -------------------------------------------------------------
    // 6. Calculate Explainable Dual Scores (Current Risk & Cumulative Audit)
    // -------------------------------------------------------------
    const activePenaltiesSum = 
      ctx.active_penalties.looking_turn +
      ctx.active_penalties.face_obscured +
      ctx.active_penalties.phone_present +
      ctx.active_penalties.out_of_seat +
      ctx.active_penalties.abnormal_motion;
    
    const current_score = Math.min(100, Math.max(0, activePenaltiesSum));

    let eventScoreContribution = 0;
    for (const evt of triggeredEvents) {
      if (evt.score_contribution > 0) {
        eventScoreContribution += evt.score_contribution;
      }
    }

    const previousCumulative = track.cumulative_score ?? track.suspicion_score ?? 0;
    const addedScore = Math.round(eventScoreContribution * 0.4);
    const cumulative_score = Math.min(100, Math.max(previousCumulative, previousCumulative + addedScore));
    const max_score = Math.max(track.max_score || 0, current_score, cumulative_score);
    const suspicion_score = cumulative_score;

    // Attach dual scores to newly triggered events for complete audit reconstructibility
    for (const evt of triggeredEvents) {
      evt.current_score = current_score;
      evt.cumulative_score = cumulative_score;
    }

    return { events: triggeredEvents, suspicion_score, current_score, cumulative_score, max_score };
  }

  private createEvent(params: {
    event_type: BehaviorEventType;
    camera_id: string;
    track_id?: string;
    global_person_id?: string;
    confidence: number;
    score_contribution: number;
    severity: EventSeverity;
    description: string;
    duration_ms?: number;
    track?: CameraTrack;
  }, now: number): BehaviorEvent {
    return {
      id: `evt-${now}-${Math.floor(Math.random() * 10000)}`,
      session_id: this.session_id,
      event_type: params.event_type,
      camera_id: params.camera_id,
      track_id: params.track_id,
      global_person_id: params.global_person_id || params.track?.global_person_id || params.track?.person_id,
      timestamp: now,
      confidence: Math.round(params.confidence * 100) / 100,
      score_contribution: params.score_contribution,
      severity: params.severity,
      description: params.description,
      evidence: {
        bbox: params.track?.bbox ? { ...params.track.bbox } : undefined,
        detector_confidence: params.confidence,
        duration_ms: params.duration_ms
      }
    };
  }

  /**
   * Admin action: clear active penalties for a track (resets immediate risk to 0)
   */
  public clearTrackWarning(track_id: string): void {
    const ctx = this.track_contexts.get(track_id);
    const now = Date.now();
    if (ctx) {
      ctx.active_penalties = {
        looking_turn: 0,
        face_obscured: 0,
        phone_present: 0,
        out_of_seat: 0,
        abnormal_motion: 0
      };
      ctx.current_direction = 'center';
      ctx.direction_started_at = now;
      ctx.looking_turn_count = 0;
      ctx.looking_alert_fired = false;
      ctx.last_turn_timestamp = now;
      ctx.last_repeated_looking_event_time = now;
      ctx.face_missing_since = null;
      ctx.face_missing_alert_fired = false;
      ctx.phone_detected_since = null;
      ctx.last_phone_alert_time = now;
      ctx.is_out_of_seat = false;
      ctx.left_seat_since = null;
      ctx.left_seat_alert_fired = false;
      ctx.velocity_spikes = 0;
      ctx.last_abnormal_movement_time = now;
    }
  }

  public pruneStaleContexts(activeTrackIds: Set<string>): void {
    for (const trackId of this.track_contexts.keys()) {
      if (!activeTrackIds.has(trackId)) {
        this.track_contexts.delete(trackId);
      }
    }
  }
}
