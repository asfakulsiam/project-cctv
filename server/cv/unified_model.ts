/**
 * Smart Classroom Exam Monitoring System
 * Unified Cross-Camera Student Identity Model & Global Identity Manager (Layer 3)
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. Three-Layer Identity Architecture:
 *    - Layer 1: Ephemeral per-frame Detection ID (e.g., det-000001)
 *    - Layer 2: Camera-scoped Track ID (e.g., CAM1-T001, CAM2-T004)
 *    - Layer 3: Persistent Global Person ID (e.g., P-001) linked to formal StudentRecord (e.g., STU-2026-0812)
 * 2. Visual Re-ID + Geometric Fusion:
 *    Combines appearance cosine similarity (when embeddings are present) with seat & student priors.
 * 3. Sole Authority for Global Person IDs:
 *    UnifiedStudentManager is the ONLY component authorized to allocate P-001, P-002, etc.
 * 4. Single-Camera Uniqueness Constraint:
 *    The same Global Person ID can NEVER be assigned to two different active tracks in the same camera simultaneously.
 * 5. Temporal Seat Confirmation:
 *    Requires stable spatial observation across consecutive frames before latching seat assignment.
 * 6. Dual Suspicion Scores + Max Score:
 *    - current_score: Immediate risk window (resettable)
 *    - cumulative_score: Monotonically non-decreasing audit score
 *    - max_score: Peak instantaneous risk level
 * 7. Observation Quality Priority:
 *    Dynamically evaluates clarity (resolution, face visibility, scale) to mark is_best_view: true.
 * 8. Centralized Thresholds & Warning Level:
 *    Uses configured warning_suspicion_threshold and high_suspicion_threshold from settings.
 */

import { 
  CameraConfig, 
  CameraTrack, 
  GlobalPerson,
  SeatRecord, 
  StudentObservation, 
  StudentRecord,
  getWarningLevel,
  MonitoringThresholds
} from '../../src/types.js';
import { RealPersonDetector } from './personDetector.js';

export interface GlobalIdentityThresholds {
  warning_suspicion_threshold: number;
  high_suspicion_threshold: number;
  reid_similarity_threshold: number;
}

export interface GlobalIdentityEvidence {
  appearanceSimilarity: number;
  seatMatch: boolean;
  studentMatch: boolean;
  temporalContinuity: number;
  cameraCompatibility: number;
}

export class UnifiedStudentManager {
  private students: Map<string, StudentRecord> = new Map(); // student_id -> StudentRecord
  private global_persons: Map<string, GlobalPerson> = new Map(); // global_person_id -> GlobalPerson
  private seats: SeatRecord[] = [];
  private next_person_number = 1;
  private thresholds: GlobalIdentityThresholds = {
    warning_suspicion_threshold: 40,
    high_suspicion_threshold: 65,
    reid_similarity_threshold: 0.70
  };

  private fullThresholds?: MonitoringThresholds;

  // Seat stability tracker: track_id -> { seat_id, count }
  private trackSeatStability: Map<string, { seat_id: string; count: number }> = new Map();

  // Cross-camera event deduplication cache: "gp_id:event_type" -> timestamp
  private recentEventsCache: Map<string, number> = new Map();

  constructor(
    initialStudents: StudentRecord[], 
    seats: SeatRecord[],
    thresholds?: Partial<GlobalIdentityThresholds>,
    fullThresholds?: MonitoringThresholds,
    initialGlobalPersons?: GlobalPerson[]
  ) {
    this.seats = seats;
    this.fullThresholds = fullThresholds;
    if (thresholds) {
      this.thresholds = { ...this.thresholds, ...thresholds };
    }
    
    // Restore persistent GlobalPerson entities across server restarts
    if (initialGlobalPersons && initialGlobalPersons.length > 0) {
      for (const gp of initialGlobalPersons) {
        if (gp && gp.id) {
          this.global_persons.set(gp.id, {
            ...gp,
            camera_tracks: [],
            current_score: 0,
            warning_latched: false
          });
          if (/^P-\d+$/i.test(gp.id)) {
            const num = parseInt(gp.id.replace(/^P-/i, ''), 10);
            if (!isNaN(num) && num >= this.next_person_number) {
              this.next_person_number = num + 1;
            }
          }
        }
      }
    }

    for (const student of initialStudents) {
      const pid = student.person_id || student.global_person_id;
      if (pid && /^P-\d+$/i.test(pid)) {
        const num = parseInt(pid.replace(/^P-/i, ''), 10);
        if (!isNaN(num) && num >= this.next_person_number) {
          this.next_person_number = num + 1;
        }
      }
      this.students.set(student.id, {
        ...student,
        person_id: pid,
        global_person_id: pid,
        status: 'absent',
        current_score: 0,
        cumulative_score: 0,
        max_score: 0,
        warning_level: 'normal',
        active_observations: []
      });
    }
  }

  public setThresholds(thresholds: Partial<GlobalIdentityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  public updateThresholds(thresholds: MonitoringThresholds): void {
    this.fullThresholds = thresholds;
    this.thresholds.warning_suspicion_threshold = thresholds.warning_suspicion_threshold;
    this.thresholds.high_suspicion_threshold = thresholds.high_suspicion_threshold;
  }

  public updateSeats(seats: SeatRecord[]): void {
    this.seats = seats;
  }

  /**
   * Update student roster. Ensures removed students are cleaned up,
   * while preserving persistent person_id and global_person_id assignments.
   */
  public updateStudentList(students: StudentRecord[]): void {
    const newStudentIds = new Set(students.map(s => s.id));

    // Remove deleted students
    for (const [id] of this.students.entries()) {
      if (!newStudentIds.has(id)) {
        this.students.delete(id);
      }
    }

    // Update or insert students, preserving person_id with DB as the persistent source of truth
    for (const s of students) {
      const existing = this.students.get(s.id);
      const pid = (s.person_id || s.global_person_id) ? (s.person_id || s.global_person_id) : undefined;
      if (pid && /^P-\d+$/i.test(pid)) {
        const num = parseInt(pid.replace(/^P-/i, ''), 10);
        if (!isNaN(num) && num >= this.next_person_number) {
          this.next_person_number = num + 1;
        }
      }

      if (existing) {
        this.students.set(s.id, {
          ...existing,
          student_id_number: s.student_id_number,
          name: s.name,
          classroom_id: s.classroom_id,
          seat_id: s.seat_id,
          notes: s.notes,
          person_id: pid,
          global_person_id: pid
        });
      } else {
        const prev = this.students.get(s.id);
        this.students.set(s.id, {
          ...s,
          person_id: pid,
          global_person_id: pid,
          status: prev ? prev.status : 'absent',
          current_score: prev ? prev.current_score : 0,
          cumulative_score: prev ? prev.cumulative_score : 0,
          max_score: prev ? prev.max_score : 0,
          warning_level: prev ? prev.warning_level : 'normal',
          active_observations: prev ? prev.active_observations : []
        });
        // If active global person already exists for this person_id, update seat if available
        if (pid && this.global_persons.has(pid)) {
          const gp = this.global_persons.get(pid)!;
          if (s.seat_id && !gp.seat_id) gp.seat_id = s.seat_id;
        }
      }
    }
  }

  /**
   * Sole authoritative generator of Layer 3 Global Person IDs.
   * Example: P-001, P-002
   */
  private generateGlobalPersonId(): string {
    const numStr = String(this.next_person_number++).padStart(3, '0');
    return `P-${numStr}`;
  }

  /**
   * Evaluates observation clarity based on camera resolution, visibility, face confidence,
   * and bounding box area (nearer/larger subjects give higher observation clarity).
   */
  private computeObservationQuality(track: CameraTrack, camera: CameraConfig): number {
    const cameraBase = (camera.quality_score || 80) * 0.4;
    const faceFactor = track.face_visible ? (track.face_confidence * 30) : 5;
    const boxArea = track.bbox.width * track.bbox.height;
    const scaleFactor = Math.min(30, Math.max(5, (boxArea / 0.15) * 20));

    return Math.min(100, Math.round(cameraBase + faceFactor + scaleFactor));
  }

  /**
   * Find seat intersection using bottom-center of bounding box (desk/feet position)
   * with uniform 0.04 margin tolerance.
   */
  private findMatchingSeat(track: CameraTrack, cameraId: string): SeatRecord | null {
    if (this.seats.length === 0) return null;

    const footX = track.bbox.x + track.bbox.width / 2;
    const footY = track.bbox.y + track.bbox.height * 0.88;
    const margin = 0.04;

    for (const seat of this.seats) {
      const region = seat.camera_regions[cameraId];
      if (region) {
        const inside = 
          footX >= (region.x - margin) &&
          footX <= (region.x + region.width + margin) &&
          footY >= (region.y - margin) &&
          footY <= (region.y + region.height + margin);

        if (inside) {
          return seat;
        }
      }
    }

    return null;
  }

  /**
   * Temporal seat confirmation: require stable observation count before latching seat_id.
   */
  private confirmSeatTemporal(trackId: string, candidateSeatId: string | null): string | null {
    if (!candidateSeatId) {
      this.trackSeatStability.delete(trackId);
      return null;
    }

    const current = this.trackSeatStability.get(trackId);
    if (current && current.seat_id === candidateSeatId) {
      current.count++;
      if (current.count >= 2) {
        return candidateSeatId;
      }
      return null;
    } else {
      this.trackSeatStability.set(trackId, { seat_id: candidateSeatId, count: 1 });
      return null;
    }
  }

  /**
   * Match a camera track to an existing Global Person using Re-ID appearance embedding,
   * corroborated by seat/student priors, respecting camera exclusivity.
   */
  private matchGlobalPerson(
    track: CameraTrack,
    matchedStudentId: string | null,
    matchedSeatId: string | null,
    excludedGpIds: Set<string>
  ): string | null {
    let bestGpId: string | null = null;
    let highestMatchScore = 0;

    for (const gp of this.global_persons.values()) {
      if (excludedGpIds.has(gp.id)) continue;

      let visualSimilarity = 0;
      if (track.appearance_embedding && gp.appearance_embedding) {
        visualSimilarity = RealPersonDetector.computeCosineSimilarity(
          track.appearance_embedding,
          gp.appearance_embedding
        );
      }

      // Prior evidence from seat position
      let priorScore = 0;
      if (matchedSeatId && gp.seat_id === matchedSeatId) {
        priorScore = 0.85;
      }

      // Strong negative prior: If both have distinct assigned seats, do not merge
      if (matchedSeatId && gp.seat_id && matchedSeatId !== gp.seat_id) {
        continue;
      }

      // Fused cross-camera match score: Visual Re-ID + Spatial Prior
      let matchScore = visualSimilarity;
      if (priorScore > 0) {
        matchScore = (visualSimilarity > 0) 
          ? (0.60 * visualSimilarity + 0.40 * priorScore)
          : priorScore;
      }

      if (matchScore >= this.thresholds.reid_similarity_threshold && matchScore > highestMatchScore) {
        highestMatchScore = matchScore;
        bestGpId = gp.id;
      }
    }

    return bestGpId;
  }

  /**
   * Check cross-camera event deduplication cache.
   * Returns true if event is allowed (not a duplicate within 3.5 seconds).
   */
  public shouldEmitCrossCameraEvent(globalPersonId: string, eventType: string, timestamp: number): boolean {
    const key = `${globalPersonId}:${eventType}`;
    const lastEmitted = this.recentEventsCache.get(key);
    if (lastEmitted && (timestamp - lastEmitted) < 3500) {
      return false; // Deduplicated
    }
    this.recentEventsCache.set(key, timestamp);

    // Prune stale cache entries
    if (this.recentEventsCache.size > 200) {
      for (const [k, t] of this.recentEventsCache.entries()) {
        if (timestamp - t > 10000) this.recentEventsCache.delete(k);
      }
    }
    return true;
  }

  /**
   * Process tracks from all active cameras and synthesize into unified student records and global persons.
   */
  public syncCrossCameraObservations(
    tracksByCamera: Map<string, CameraTrack[]>,
    cameras: CameraConfig[],
    now: number = Date.now()
  ): { students: StudentRecord[]; globalPersons: GlobalPerson[] } {
    const cameraMap = new Map<string, CameraConfig>(cameras.map(c => [c.camera_id, c]));

    // Reset temporary active observations on all students
    for (const student of this.students.values()) {
      student.active_observations = [];
    }

    // Temporary active camera track links per global person
    const activeGPLinks = new Map<string, Array<{
      camera_id: string;
      track_id: string;
      quality: number;
      is_best_view: boolean;
      bbox: any;
      track: CameraTrack;
    }>>();

    // Associate camera tracks to students & global persons
    for (const [cameraId, tracks] of tracksByCamera.entries()) {
      const camera = cameraMap.get(cameraId);
      if (!camera || camera.status !== 'online') continue;

      // Track Global Person IDs already assigned in this specific camera to enforce Single-Camera Uniqueness
      const cameraAssignedGPs = new Set<string>();

      for (const track of tracks) {
        let matchedStudentId: string | null = null;
        let matchedSeatId: string | null = null;

        // Association Priority A: Explicit student ID already attached to track
        if (track.associated_student_id && this.students.has(track.associated_student_id)) {
          matchedStudentId = track.associated_student_id;
        }

        // Association Priority B: Seat geometry mapping with temporal confirmation
        const rawSeat = this.findMatchingSeat(track, cameraId);
        const confirmedSeatId = this.confirmSeatTemporal(track.track_id, rawSeat?.id || null);
        if (confirmedSeatId) {
          matchedSeatId = confirmedSeatId;
          track.seat_id = confirmedSeatId;
        }

        // Layer 3: Visual Re-ID Global Person Matching
        let globalPersonId = track.global_person_id || track.person_id;
        if (globalPersonId && cameraAssignedGPs.has(globalPersonId)) {
          globalPersonId = undefined;
        }

        if (!globalPersonId) {
          // Find match respecting single-camera uniqueness
          globalPersonId = this.matchGlobalPerson(track, matchedStudentId, matchedSeatId, cameraAssignedGPs) || undefined;
        }

        // Allocate or reuse Global Person ID
        if (!globalPersonId) {
          globalPersonId = this.generateGlobalPersonId();
        }

        // Ensure every detected human automatically has a StudentRecord (no seat limitations)
        let studentRec: StudentRecord | null = null;
        if (matchedStudentId) {
          studentRec = this.students.get(matchedStudentId) || null;
        } else {
          for (const s of this.students.values()) {
            if (s.person_id === globalPersonId || s.global_person_id === globalPersonId) {
              studentRec = s;
              matchedStudentId = s.id;
              break;
            }
          }
          if (!studentRec) {
            const numPart = globalPersonId.replace(/^P-/i, '');
            const autoId = `stu-auto-${globalPersonId.toLowerCase()}`;
            studentRec = {
              id: autoId,
              student_id_number: `S-20${numPart.padStart(2, '0')}`,
              name: `Student ${globalPersonId}`,
              classroom_id: 'hall-a',
              person_id: globalPersonId,
              global_person_id: globalPersonId,
              seat_id: matchedSeatId || undefined,
              status: 'present',
              current_score: 0,
              cumulative_score: 0,
              max_score: 0,
              unified_suspicion_score: 0,
              warning_level: 'normal',
              active_observations: []
            };
            this.students.set(autoId, studentRec);
            matchedStudentId = autoId;
          }
        }

        // Ensure global person is present in registry
        let gp = this.global_persons.get(globalPersonId);
        if (!gp) {
          gp = {
            id: globalPersonId,
            person_id: globalPersonId,
            global_person_id: globalPersonId,
            seat_id: matchedSeatId || undefined,
            appearance_embedding: track.appearance_embedding ? [...track.appearance_embedding] : undefined,
            camera_tracks: [],
            current_score: track.current_score || 0,
            cumulative_score: track.cumulative_score || track.suspicion_score || 0,
            max_score: track.max_score || track.current_score || 0,
            warning_latched: track.warning_latched || false,
            last_seen: now,
            status: 'active'
          };
          this.global_persons.set(globalPersonId, gp);
        } else {
          // Update running appearance embedding for matched Global Person
          if (track.appearance_embedding) {
            if (!gp.appearance_embedding) {
              gp.appearance_embedding = [...track.appearance_embedding];
            } else {
              const alpha = 0.15;
              gp.appearance_embedding = gp.appearance_embedding.map((val, idx) => 
                Math.round((val * (1 - alpha) + (track.appearance_embedding![idx] || 0) * alpha) * 1000) / 1000
              );
            }
          }
          if (matchedSeatId && !gp.seat_id) {
            gp.seat_id = matchedSeatId;
          }
        }

        // Update student record link if known
        if (studentRec) {
          if (!studentRec.person_id) studentRec.person_id = globalPersonId;
          if (!studentRec.global_person_id) studentRec.global_person_id = globalPersonId;
        }

        // Enforce uniqueness per camera
        cameraAssignedGPs.add(globalPersonId);

        // Propagate GlobalPerson association back to CameraTrack!
        track.global_person_id = globalPersonId;
        track.person_id = globalPersonId;
        const quality = this.computeObservationQuality(track, camera);

        // Record active link for Global Person
        if (!activeGPLinks.has(globalPersonId)) {
          activeGPLinks.set(globalPersonId, []);
        }
        activeGPLinks.get(globalPersonId)!.push({
          camera_id: cameraId,
          track_id: track.track_id,
          quality,
          is_best_view: false,
          bbox: track.bbox,
          track
        });

        // Record observation on associated student
        if (matchedStudentId && this.students.has(matchedStudentId)) {
          const student = this.students.get(matchedStudentId)!;
          student.active_observations.push({
            camera_id: cameraId,
            track_id: track.track_id,
            global_person_id: globalPersonId,
            quality,
            is_best_view: false,
            timestamp: now,
            bbox: track.bbox,
            suspicion_score: track.cumulative_score,
            current_score: track.current_score,
            cumulative_score: track.cumulative_score,
            max_score: track.max_score
          });
        }
      }
    }

    // Step 2: Determine Best View & Update Scores for each Global Person
    for (const [gpId, links] of activeGPLinks.entries()) {
      const gp = this.global_persons.get(gpId);
      if (!gp || links.length === 0) continue;

      let maxQ = -1;
      let bestLink = links[0];
      for (const link of links) {
        if (link.quality > maxQ) {
          maxQ = link.quality;
          bestLink = link;
        }
      }
      if (bestLink) {
        bestLink.is_best_view = true;
      }

      gp.camera_tracks = links.map(l => ({
        camera_id: l.camera_id,
        track_id: l.track_id,
        quality: l.quality,
        is_best_view: l.is_best_view
      }));
      gp.last_seen = now;

      // Update dual scores and max score on GlobalPerson
      const maxCurrent = Math.max(...links.map(l => l.track.current_score || 0));
      const maxCumulative = Math.max(...links.map(l => l.track.cumulative_score || l.track.suspicion_score || 0));
      gp.current_score = maxCurrent;
      gp.cumulative_score = Math.max(gp.cumulative_score || 0, maxCumulative);
      gp.max_score = Math.max(gp.max_score || 0, gp.current_score, gp.cumulative_score);

      // Warning latching occurs strictly when active current behavioral violation occurs
      if (gp.current_score >= this.thresholds.warning_suspicion_threshold) {
        gp.warning_latched = true;
        gp.warning_latched_time = now;
      }
    }

    // Prune stale GlobalPersons not seen in > 10 minutes
    for (const [gpId, gp] of this.global_persons.entries()) {
      if (!activeGPLinks.has(gpId)) {
        if ((now - gp.last_seen) > 600000) {
          this.global_persons.delete(gpId);
        }
      }
    }

    // Step 3: Determine Best View & Unified Scores for each Student
    const thresholdsConfig: MonitoringThresholds = this.fullThresholds || {
      looking_duration_sec: 3.5,
      face_hidden_duration_sec: 4.0,
      leave_seat_grace_sec: 5.0,
      phone_confidence_min: 0.65,
      high_suspicion_threshold: this.thresholds.high_suspicion_threshold,
      warning_suspicion_threshold: this.thresholds.warning_suspicion_threshold,
      movement_threshold_px: 25
    };

    for (const student of this.students.values()) {
      if (student.active_observations.length === 0) {
        student.status = 'absent';
        student.current_score = 0;
        student.warning_level = 'normal';
        continue;
      }

      student.status = 'present';

      // Mark best view
      let bestObs: StudentObservation | null = null;
      let maxQuality = -1;

      for (const obs of student.active_observations) {
        if (obs.quality > maxQuality) {
          maxQuality = obs.quality;
          bestObs = obs;
        }
      }

      if (bestObs) {
        bestObs.is_best_view = true;
      }

      // Aggregate dual scores with observation quality weighting
      let weightedCumulativeSum = 0;
      let weightedCurrentSum = 0;
      let totalWeight = 0;

      for (const obs of student.active_observations) {
        const cameraTracks = tracksByCamera.get(obs.camera_id);
        const track = cameraTracks?.find(t => t.track_id === obs.track_id);
        if (track) {
          const weight = obs.quality / 100;
          const cum = track.cumulative_score ?? track.suspicion_score ?? 0;
          const cur = track.current_score ?? 0;
          weightedCumulativeSum += cum * weight;
          weightedCurrentSum += cur * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight > 0) {
        const aggregatedCum = Math.round(weightedCumulativeSum / totalWeight);
        const aggregatedCur = Math.round(weightedCurrentSum / totalWeight);

        student.cumulative_score = Math.max(student.cumulative_score || 0, aggregatedCum);
        student.current_score = aggregatedCur;
        student.max_score = Math.max(student.max_score || 0, aggregatedCur, student.cumulative_score);
        student.unified_suspicion_score = student.cumulative_score;
      }

      // Warning Level & Status Flagging
      const isGpLatched = student.person_id ? this.global_persons.get(student.person_id)?.warning_latched : false;

      if ((student.current_score || 0) >= this.thresholds.high_suspicion_threshold) {
        student.warning_level = 'critical';
        student.status = 'flagged';
      } else if ((student.current_score || 0) >= this.thresholds.warning_suspicion_threshold || isGpLatched) {
        student.warning_level = 'warning';
        student.status = 'present';
      } else {
        student.warning_level = 'normal';
        student.status = 'present';
      }
    }

    return {
      students: Array.from(this.students.values()),
      globalPersons: Array.from(this.global_persons.values()).filter(gp => gp.camera_tracks && gp.camera_tracks.length > 0)
    };
  }

  public getCandidates(): GlobalPerson[] {
    return Array.from(this.global_persons.values()).filter(gp => gp.camera_tracks && gp.camera_tracks.length > 0);
  }

  public editCandidate(personId: string, updates: { seat_id?: string; student_id?: string | null; notes?: string }): GlobalPerson | null {
    const gp = this.global_persons.get(personId);
    if (!gp) return null;

    if (updates.notes !== undefined) {
      gp.notes = updates.notes;
    }
    if (updates.seat_id !== undefined) {
      gp.seat_id = updates.seat_id || undefined;
    }
    if (updates.student_id !== undefined) {
      this.associatePersonWithStudent(personId, updates.student_id);
    }
    return gp;
  }

  public deleteCandidate(personId: string): boolean {
    const gp = this.global_persons.get(personId);
    if (!gp) return false;

    // Clear student association if any student was linked to this personId
    for (const student of this.students.values()) {
      if (student.person_id === personId || student.global_person_id === personId) {
        student.person_id = undefined;
        student.global_person_id = undefined;
        student.active_observations = [];
        student.status = 'absent';
        student.current_score = 0;
        student.warning_level = 'normal';
      }
    }

    this.global_persons.delete(personId);
    return true;
  }

  /**
   * Deterministic Post-Behavior Score Synchronization:
   * Re-synchronizes scores on GlobalPerson and StudentRecord after BehaviorAnalyzer
   * has updated CameraTrack suspicion_score, current_score, cumulative_score, max_score.
   * Guarantees 0-tick lag between CameraTracks, GlobalPersons, Students, and Stats.
   */
  public syncScoresAfterBehavior(
    tracksByCamera: Map<string, CameraTrack[]>,
    now: number = Date.now()
  ): { students: StudentRecord[]; globalPersons: GlobalPerson[] } {
    const thresholdsConfig: MonitoringThresholds = {
      looking_duration_sec: 3.5,
      face_hidden_duration_sec: 4.0,
      leave_seat_grace_sec: 5.0,
      phone_confidence_min: 0.65,
      high_suspicion_threshold: this.thresholds.high_suspicion_threshold,
      warning_suspicion_threshold: this.thresholds.warning_suspicion_threshold,
      movement_threshold_px: 25
    };

    // 1. Sync GlobalPersons with updated track scores
    for (const gp of this.global_persons.values()) {
      if (!gp.camera_tracks || gp.camera_tracks.length === 0) continue;

      let maxCurrent = 0;
      let maxCumulative = 0;
      let maxPeak = gp.max_score || 0;

      for (const trackRef of gp.camera_tracks) {
        const camTracks = tracksByCamera.get(trackRef.camera_id);
        const trk = camTracks?.find(t => t.track_id === trackRef.track_id);
        if (trk) {
          maxCurrent = Math.max(maxCurrent, trk.current_score || 0);
          maxCumulative = Math.max(maxCumulative, trk.cumulative_score || trk.suspicion_score || 0);
          maxPeak = Math.max(maxPeak, trk.max_score || 0, maxCurrent, maxCumulative);
        }
      }

      gp.current_score = maxCurrent;
      gp.cumulative_score = Math.max(gp.cumulative_score || 0, maxCumulative);
      gp.max_score = Math.max(maxPeak, gp.cumulative_score, gp.current_score);

      // Warning latch occurs strictly when current behavioral violation breaches warning threshold
      if (gp.current_score >= this.thresholds.warning_suspicion_threshold) {
        gp.warning_latched = true;
        gp.warning_latched_time = now;
      }
    }

    // 2. Sync Students with observation quality-weighted track scores
    for (const student of this.students.values()) {
      if (student.active_observations.length === 0) {
        student.status = 'absent';
        student.current_score = 0;
        student.warning_level = 'normal';
        continue;
      }

      let weightedCumulativeSum = 0;
      let weightedCurrentSum = 0;
      let totalWeight = 0;

      for (const obs of student.active_observations) {
        const camTracks = tracksByCamera.get(obs.camera_id);
        const trk = camTracks?.find(t => t.track_id === obs.track_id);
        if (trk) {
          obs.current_score = trk.current_score;
          obs.cumulative_score = trk.cumulative_score;
          obs.suspicion_score = trk.cumulative_score;
          obs.max_score = trk.max_score;

          const weight = (obs.quality || 50) / 100;
          const cum = trk.cumulative_score ?? trk.suspicion_score ?? 0;
          const cur = trk.current_score ?? 0;
          weightedCumulativeSum += cum * weight;
          weightedCurrentSum += cur * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight > 0) {
        const aggregatedCum = Math.round(weightedCumulativeSum / totalWeight);
        const aggregatedCur = Math.round(weightedCurrentSum / totalWeight);

        student.cumulative_score = Math.max(student.cumulative_score || 0, aggregatedCum);
        student.current_score = aggregatedCur;
        student.max_score = Math.max(student.max_score || 0, aggregatedCur, student.cumulative_score);
        student.unified_suspicion_score = student.cumulative_score;
      }

      // Warning Level & Status Flagging
      const isGpLatched = student.person_id ? this.global_persons.get(student.person_id)?.warning_latched : false;

      if ((student.current_score || 0) >= this.thresholds.high_suspicion_threshold) {
        student.warning_level = 'critical';
        student.status = 'flagged';
      } else if ((student.current_score || 0) >= this.thresholds.warning_suspicion_threshold || isGpLatched) {
        student.warning_level = 'warning';
        student.status = 'present';
      } else {
        student.warning_level = 'normal';
        student.status = 'present';
      }
    }

    return {
      students: Array.from(this.students.values()),
      globalPersons: Array.from(this.global_persons.values()).filter(gp => gp.camera_tracks && gp.camera_tracks.length > 0)
    };
  }

  public clearCurrentCandidates(): boolean {
    this.global_persons.clear();
    this.trackSeatStability.clear();
    this.recentEventsCache.clear();

    for (const student of this.students.values()) {
      student.active_observations = [];
      student.status = 'absent';
      student.current_score = 0;
      student.warning_level = 'normal';
      student.warning_cleared_at = Date.now();
    }
    return true;
  }

  public clearStudentWarning(studentId: string): boolean {
    const student = this.students.get(studentId);
    if (!student) return false;
    // Proctor clearance: Reset immediate current risk, record timestamp, preserve cumulative & max score
    const now = Date.now();
    student.current_score = 0;
    student.warning_level = 'normal';
    student.warning_cleared_at = now;
    student.status = 'present';

    // Also unlatch warning on associated Global Person
    if (student.person_id && this.global_persons.has(student.person_id)) {
      const gp = this.global_persons.get(student.person_id)!;
      gp.warning_latched = false;
      gp.current_score = 0;
      gp.warning_cleared_at = now;
    }
    return true;
  }

  public clearCandidateWarning(personId: string): boolean {
    const gp = this.global_persons.get(personId);
    if (!gp) return false;
    const now = Date.now();
    gp.warning_latched = false;
    gp.current_score = 0;
    gp.warning_cleared_at = now;
    return true;
  }

  public getGlobalPerson(globalPersonId: string): GlobalPerson | undefined {
    return this.global_persons.get(globalPersonId);
  }

  public associatePersonWithStudent(personId: string, studentId: string | null): boolean {
    const gp = this.global_persons.get(personId);
    if (!gp) return false;

    if (!studentId) {
      for (const s of this.students.values()) {
        if (s.person_id === personId || s.global_person_id === personId) {
          s.person_id = undefined;
          s.global_person_id = undefined;
        }
      }
      return true;
    }

    const student = this.students.get(studentId);
    if (!student) return false;

    for (const otherS of this.students.values()) {
      if (otherS.id !== studentId && (otherS.person_id === personId || otherS.global_person_id === personId)) {
        otherS.person_id = undefined;
        otherS.global_person_id = undefined;
      }
    }

    student.person_id = personId;
    student.global_person_id = personId;
    return true;
  }

  public getStudentRecord(studentId: string): StudentRecord | undefined {
    return this.students.get(studentId);
  }

  public getAllGlobalPersons(): GlobalPerson[] {
    return Array.from(this.global_persons.values());
  }

  public getAllStudents(): StudentRecord[] {
    return Array.from(this.students.values());
  }

  public getStudents(): StudentRecord[] {
    return this.getAllStudents();
  }

  public reset(): void {
    this.trackSeatStability.clear();
    this.recentEventsCache.clear();
    // Non-destructive: Preserve persistent person_id, global_person_id, cumulative audit scores, and sequence
    for (const gp of this.global_persons.values()) {
      gp.camera_tracks = [];
      gp.current_score = 0;
      gp.warning_latched = false;
    }
    for (const s of this.students.values()) {
      s.current_score = 0;
      s.warning_level = 'normal';
      s.active_observations = [];
    }
  }
}
