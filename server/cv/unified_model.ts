/**
 * Smart Classroom Exam Monitoring System
 * Unified Cross-Camera Student Identity Model & Global Identity Manager (Layer 3)
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. Three-Layer Identity Architecture:
 *    - Layer 1: Ephemeral per-frame Detection ID (e.g., det-000104)
 *    - Layer 2: Camera-scoped Track ID (e.g., CAM1-T001, CAM2-T001)
 *    - Layer 3: Persistent Global Person ID (e.g., P-001) linked to formal StudentRecord (e.g., STU-2026-0812)
 * 2. Visual Re-ID Cross-Camera Identity Association:
 *    Cross-camera identity is determined by appearance feature embeddings (cosine similarity)
 *    fused with spatial geometry and seat priors.
 * 3. Sole Authority for Global Person IDs:
 *    GlobalIdentityManager is the ONLY component authorized to allocate P-001, P-002, etc.
 * 4. Dual Suspicion Scores + Max Score:
 *    - current_score: Immediate risk window (resettable)
 *    - cumulative_score: Monotonically non-decreasing audit trail
 *    - max_score: Peak instantaneous risk level
 * 5. Observation Quality Priority:
 *    Dynamically evaluates clarity (resolution, face visibility, scale) to mark is_best_view: true.
 * 6. Centralized Thresholds:
 *    Uses configured warning_suspicion_threshold and high_suspicion_threshold from settings.
 */

import { 
  CameraConfig, 
  CameraTrack, 
  GlobalPerson,
  SeatRecord, 
  StudentObservation, 
  StudentRecord 
} from '../../src/types.js';
import { RealPersonDetector } from './personDetector.js';

export interface GlobalIdentityThresholds {
  warning_suspicion_threshold: number;
  high_suspicion_threshold: number;
  reid_similarity_threshold: number;
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

  constructor(
    initialStudents: StudentRecord[], 
    seats: SeatRecord[],
    thresholds?: Partial<GlobalIdentityThresholds>
  ) {
    this.seats = seats;
    if (thresholds) {
      this.thresholds = { ...this.thresholds, ...thresholds };
    }
    for (const student of initialStudents) {
      this.students.set(student.id, {
        ...student,
        current_score: 0,
        cumulative_score: 0,
        max_score: 0,
        active_observations: []
      });
    }
  }

  public setThresholds(thresholds: Partial<GlobalIdentityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  public updateSeats(seats: SeatRecord[]): void {
    this.seats = seats;
  }

  public updateStudentList(students: StudentRecord[]): void {
    for (const s of students) {
      const existing = this.students.get(s.id);
      if (existing) {
        this.students.set(s.id, {
          ...existing,
          student_id_number: s.student_id_number,
          name: s.name,
          classroom_id: s.classroom_id,
          seat_id: s.seat_id,
          notes: s.notes
        });
      } else {
        this.students.set(s.id, {
          ...s,
          current_score: 0,
          cumulative_score: 0,
          max_score: 0,
          active_observations: []
        });
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
    const cameraBase = camera.quality_score * 0.4;
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

    // Bottom-center of person box represents seated desk location
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
   * Match a camera track to an existing Global Person using Re-ID appearance embedding,
   * corroborated by seat/student priors.
   */
  private matchGlobalPerson(
    track: CameraTrack,
    matchedStudentId: string | null,
    matchedSeatId: string | null
  ): string | null {
    let bestGpId: string | null = null;
    let highestMatchScore = 0;

    for (const gp of this.global_persons.values()) {
      let visualSimilarity = 0;
      if (track.appearance_embedding && gp.appearance_embedding) {
        visualSimilarity = RealPersonDetector.computeCosineSimilarity(
          track.appearance_embedding,
          gp.appearance_embedding
        );
      }

      // Prior evidence from seat or formal student enrollment
      let priorScore = 0;
      if (matchedStudentId && gp.associated_student_id === matchedStudentId) {
        priorScore = 1.0;
      } else if (matchedSeatId && gp.seat_id === matchedSeatId) {
        priorScore = 0.85;
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

      for (const track of tracks) {
        let matchedStudentId: string | null = null;
        let matchedSeatId: string | null = null;

        // Association Priority A: Explicit student ID already attached to track
        if (track.associated_student_id && this.students.has(track.associated_student_id)) {
          matchedStudentId = track.associated_student_id;
        }

        // Association Priority B: Seat geometry mapping
        if (!matchedStudentId) {
          const matchedSeat = this.findMatchingSeat(track, cameraId);
          if (matchedSeat) {
            matchedSeatId = matchedSeat.id;
            track.seat_id = matchedSeat.id;
            if (matchedSeat.assigned_student_id && this.students.has(matchedSeat.assigned_student_id)) {
              matchedStudentId = matchedSeat.assigned_student_id;
              track.associated_student_id = matchedStudentId;
            }
          }
        }

        // Layer 3: Visual Re-ID Global Person Matching
        let globalPersonId = track.global_person_id;
        if (!globalPersonId) {
          globalPersonId = this.matchGlobalPerson(track, matchedStudentId, matchedSeatId) || undefined;
        }

        // Allocate a new Global Person ID if no existing person matched
        if (!globalPersonId) {
          globalPersonId = this.generateGlobalPersonId();
          const studentRec = matchedStudentId ? this.students.get(matchedStudentId) : null;
          this.global_persons.set(globalPersonId, {
            id: globalPersonId,
            associated_student_id: matchedStudentId || undefined,
            associated_student_name: studentRec?.name,
            seat_id: matchedSeatId || undefined,
            appearance_embedding: track.appearance_embedding ? [...track.appearance_embedding] : undefined,
            camera_tracks: [],
            current_score: track.current_score || 0,
            cumulative_score: track.cumulative_score || track.suspicion_score || 0,
            max_score: track.max_score || track.current_score || 0,
            warning_latched: track.warning_latched || false,
            last_seen: now,
            status: matchedSeatId ? 'in_seat' : 'unassigned'
          });
        } else {
          // Update running appearance embedding for matched Global Person
          const gp = this.global_persons.get(globalPersonId);
          if (gp && track.appearance_embedding) {
            if (!gp.appearance_embedding) {
              gp.appearance_embedding = [...track.appearance_embedding];
            } else {
              const alpha = 0.15;
              gp.appearance_embedding = gp.appearance_embedding.map((val, idx) => 
                Math.round((val * (1 - alpha) + (track.appearance_embedding![idx] || 0) * alpha) * 1000) / 1000
              );
            }
          }
        }

        // Set authoritative global person ID on track
        track.global_person_id = globalPersonId;
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

      // Warning latch threshold comparison
      if (gp.cumulative_score >= this.thresholds.warning_suspicion_threshold || 
          gp.current_score >= this.thresholds.warning_suspicion_threshold) {
        gp.warning_latched = true;
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
    for (const student of this.students.values()) {
      if (student.active_observations.length === 0) {
        student.status = 'absent';
        student.current_score = 0;
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

      // Status flagging
      if (student.unified_suspicion_score >= this.thresholds.high_suspicion_threshold || 
          (student.current_score && student.current_score >= this.thresholds.high_suspicion_threshold)) {
        student.status = 'flagged';
      }
    }

    return {
      students: Array.from(this.students.values()),
      globalPersons: Array.from(this.global_persons.values())
    };
  }

  public clearStudentWarning(studentId: string): boolean {
    const student = this.students.get(studentId);
    if (!student) return false;
    // Proctor clearance: Reset immediate current risk, preserve cumulative score and max score
    student.current_score = 0;
    if (student.unified_suspicion_score < this.thresholds.high_suspicion_threshold) {
      student.status = 'present';
    }

    // Also unlatch warning on associated Global Person
    for (const gp of this.global_persons.values()) {
      if (gp.associated_student_id === studentId) {
        gp.warning_latched = false;
        gp.current_score = 0;
      }
    }
    return true;
  }

  public getGlobalPerson(globalPersonId: string): GlobalPerson | undefined {
    return this.global_persons.get(globalPersonId);
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
}
