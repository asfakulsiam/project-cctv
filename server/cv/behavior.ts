/**
 * Smart Classroom Exam Monitoring System
 * Temporal Behavioral Analysis & Suspicion Scoring Engine
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. Suspicion is represented strictly as a "Suspicion Score" or "Monitoring Score" (0 - 100),
 *    NEVER as a definitive claim that a student is cheating.
 * 2. A single movement or single frame MUST NOT automatically trigger high suspicion.
 * 3. Uses temporal rules: persistence duration, repeated movement thresholds, confidence gates,
 *    and event cooldowns to prevent event spamming.
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
   * Returns newly triggered events (if any) and the updated explainable suspicion score.
   */
  public analyzeTrack(
    track: CameraTrack,
    studentInfo?: { name: string; student_id_number: string },
    seatRegion?: { x: number; y: number; width: number; height: number },
    now: number = Date.now()
  ): { events: BehaviorEvent[]; suspicion_score: number } {
    const ctx = this.getOrCreateContext(track.track_id, now);
    const triggeredEvents: BehaviorEvent[] = [];

    // -------------------------------------------------------------
    // 1. Head Pose & Gaze Direction Analysis
    // -------------------------------------------------------------
    const currentDir = track.head_pose.direction;
    if (currentDir !== ctx.current_direction) {
      // Direction changed
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
          student_id: track.associated_student_id,
          student_name: studentInfo?.name,
          student_id_number: studentInfo?.student_id_number,
          confidence: track.head_pose.confidence,
          score_contribution: this.weights.repeated_looking,
          severity: 'warning',
          description: `Sustained gaze direction to ${currentDir} (${sustainedDurationSec.toFixed(1)}s)`
        }, now));
      }
    } else {
      // Facing center or downwards (normal exam writing)
      // Gradually decay head turn penalty
      ctx.active_penalties.looking_turn = Math.max(0, ctx.active_penalties.looking_turn - 1);
    }

    // Repeated glancing heuristic: 4+ head turns within 30 seconds
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
        student_id: track.associated_student_id,
        student_name: studentInfo?.name,
        student_id_number: studentInfo?.student_id_number,
        confidence: 0.85,
        score_contribution: this.weights.repeated_looking,
        severity: 'warning',
        description: 'Frequent intermittent head glancing detected across adjacent desks'
      }, now));
    }

    // -------------------------------------------------------------
    // 2. Face Visibility & Occlusion Analysis
    // -------------------------------------------------------------
    if (!track.face_visible) {
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
          student_id: track.associated_student_id,
          student_name: studentInfo?.name,
          student_id_number: studentInfo?.student_id_number,
          confidence: 0.82,
          score_contribution: this.weights.face_hidden,
          severity: 'warning',
          description: `Facial features occluded or obscured from camera view for ${obscuredDurationSec.toFixed(1)}s`
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
          student_id: track.associated_student_id,
          student_name: studentInfo?.name,
          student_id_number: studentInfo?.student_id_number,
          confidence: track.phone_confidence,
          score_contribution: this.weights.phone_detected,
          severity: 'high',
          description: `Mobile communication device detected with ${(track.phone_confidence * 100).toFixed(0)}% confidence`
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
      // Check if student center is within seat bounds (with 15% tolerance margin)
      const trackCenterX = track.bbox.x + track.bbox.width / 2;
      const trackCenterY = track.bbox.y + track.bbox.height / 2;
      const margin = 0.08;
      const insideSeat = 
        trackCenterX >= (seatRegion.x - margin) &&
        trackCenterX <= (seatRegion.x + seatRegion.width + margin) &&
        trackCenterY >= (seatRegion.y - margin) &&
        trackCenterY <= (seatRegion.y + seatRegion.height + margin);

      if (!insideSeat) {
        if (!ctx.left_seat_since) {
          ctx.left_seat_since = now;
        }
        const leftDurationSec = (now - ctx.left_seat_since) / 1000;
        if (leftDurationSec >= this.thresholds.leave_seat_grace_sec && !ctx.left_seat_alert_fired) {
          ctx.left_seat_alert_fired = true;
          ctx.is_out_of_seat = true;
          ctx.active_penalties.out_of_seat = this.weights.leaving_seat;
          triggeredEvents.push(this.createEvent({
            event_type: 'LEFT_SEAT',
            camera_id: track.camera_id,
            track_id: track.track_id,
            student_id: track.associated_student_id,
            student_name: studentInfo?.name,
            student_id_number: studentInfo?.student_id_number,
            confidence: 0.90,
            score_contribution: this.weights.leaving_seat,
            severity: 'high',
            description: `Student departed configured workstation desk for ${leftDurationSec.toFixed(1)}s`
          }, now));
        }
      } else {
        if (ctx.is_out_of_seat) {
          // Returned to seat!
          ctx.is_out_of_seat = false;
          ctx.left_seat_alert_fired = false;
          ctx.left_seat_since = null;
          ctx.active_penalties.out_of_seat = 0;
          triggeredEvents.push(this.createEvent({
            event_type: 'RETURNED_TO_SEAT',
            camera_id: track.camera_id,
            track_id: track.track_id,
            student_id: track.associated_student_id,
            student_name: studentInfo?.name,
            student_id_number: studentInfo?.student_id_number,
            confidence: 0.92,
            score_contribution: -15,
            severity: 'info',
            description: 'Student returned to assigned workstation'
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
        triggeredEvents.push(this.createEvent({
          event_type: 'ABNORMAL_MOVEMENT',
          camera_id: track.camera_id,
          track_id: track.track_id,
          student_id: track.associated_student_id,
          student_name: studentInfo?.name,
          student_id_number: studentInfo?.student_id_number,
          confidence: 0.80,
          score_contribution: this.weights.abnormal_movement,
          severity: 'warning',
          description: `Rapid agitation/movement detected (magnitude ${track.movement_magnitude})`
        }, now));
      }
    } else {
      ctx.active_penalties.abnormal_motion = Math.max(0, ctx.active_penalties.abnormal_motion - 1);
    }

    // -------------------------------------------------------------
    // 6. Calculate Explainable Composite Suspicion Score (Monotonically Non-Decreasing)
    // -------------------------------------------------------------
    let eventScoreContribution = 0;
    for (const evt of triggeredEvents) {
      if (evt.score_contribution > 0) {
        eventScoreContribution += evt.score_contribution;
      }
    }

    const previousScore = track.suspicion_score || 0;
    const addedScore = Math.round(eventScoreContribution * 0.4);
    const suspicion_score = Math.min(100, Math.max(previousScore, previousScore + addedScore));

    return { events: triggeredEvents, suspicion_score };
  }

  private createEvent(params: {
    event_type: BehaviorEventType;
    camera_id: string;
    track_id?: string;
    student_id?: string;
    student_name?: string;
    student_id_number?: string;
    confidence: number;
    score_contribution: number;
    severity: EventSeverity;
    description: string;
  }, now: number): BehaviorEvent {
    return {
      id: `evt-${now}-${Math.floor(Math.random() * 10000)}`,
      session_id: this.session_id,
      event_type: params.event_type,
      student_id: params.student_id,
      student_id_number: params.student_id_number,
      student_name: params.student_name,
      camera_id: params.camera_id,
      track_id: params.track_id,
      timestamp: now,
      confidence: Math.round(params.confidence * 100) / 100,
      score_contribution: params.score_contribution,
      severity: params.severity,
      description: params.description
    };
  }

  public pruneStaleContexts(activeTrackIds: Set<string>): void {
    for (const trackId of this.track_contexts.keys()) {
      if (!activeTrackIds.has(trackId)) {
        this.track_contexts.delete(trackId);
      }
    }
  }
}
