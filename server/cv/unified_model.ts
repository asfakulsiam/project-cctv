/**
 * Smart Classroom Exam Monitoring System
 * Unified Cross-Camera Student Identity Model & Global Person Registry (Layer 3)
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. Three-Layer Identity Architecture:
 *    - Layer 1: Ephemeral per-frame Detection ID (e.g., det-104)
 *    - Layer 2: Camera-scoped Track ID (e.g., CAM1-T001, CAM2-T001)
 *    - Layer 3: Persistent Global Person ID (e.g., P-001) linked to formal StudentRecord (e.g., STU-2026-0812)
 * 2. Cross-Camera Association:
 *    When multiple cameras observe the same subject/seat, tracks are aggregated into ONE
 *    GlobalPerson and ONE unified StudentRecord.
 * 3. Stationary & Out-of-Seat Persistence:
 *    If a student stands up or moves away from their desk, the GlobalPerson ID remains bound to them.
 * 4. Dual Suspicion Scores:
 *    Maintains immediate current_score and monotonically non-decreasing cumulative_score.
 * 5. Observation Quality Priority:
 *    Selects the clearest view dynamically (is_best_view: true).
 */

import { 
  CameraConfig, 
  CameraTrack, 
  GlobalPerson,
  SeatRecord, 
  StudentObservation, 
  StudentRecord 
} from '../../src/types.js';

export class UnifiedStudentManager {
  private students: Map<string, StudentRecord> = new Map(); // student_id -> StudentRecord
  private global_persons: Map<string, GlobalPerson> = new Map(); // global_person_id -> GlobalPerson
  private seats: SeatRecord[] = [];
  private next_person_number = 1;

  constructor(initialStudents: StudentRecord[], seats: SeatRecord[]) {
    this.seats = seats;
    for (const student of initialStudents) {
      this.students.set(student.id, {
        ...student,
        current_score: 0,
        cumulative_score: 0,
        active_observations: []
      });
    }
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
          active_observations: []
        });
      }
    }
  }

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
   * Process tracks from all active cameras and synthesize into the unified student records and global persons.
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

        // Association Priority B: Seat mapping intersection
        if (!matchedStudentId && this.seats.length > 0) {
          const trackCenterX = track.bbox.x + track.bbox.width / 2;
          const trackCenterY = track.bbox.y + track.bbox.height / 2;

          for (const seat of this.seats) {
            const region = seat.camera_regions[cameraId];
            if (region) {
              const inside = 
                trackCenterX >= (region.x - 0.06) &&
                trackCenterX <= (region.x + region.width + 0.06) &&
                trackCenterY >= (region.y - 0.06) &&
                trackCenterY <= (region.y + region.height + 0.06);

              if (inside) {
                matchedSeatId = seat.id;
                track.seat_id = seat.id;
                if (seat.assigned_student_id && this.students.has(seat.assigned_student_id)) {
                  matchedStudentId = seat.assigned_student_id;
                  track.associated_student_id = matchedStudentId;
                }
                break;
              }
            }
          }
        }

        // Layer 3: Global Person ID Association
        let globalPersonId = track.global_person_id;

        if (!globalPersonId) {
          // Find existing GlobalPerson matching this student or seat
          if (matchedStudentId) {
            for (const gp of this.global_persons.values()) {
              if (gp.associated_student_id === matchedStudentId) {
                globalPersonId = gp.id;
                break;
              }
            }
          } else if (matchedSeatId) {
            for (const gp of this.global_persons.values()) {
              if (gp.seat_id === matchedSeatId) {
                globalPersonId = gp.id;
                break;
              }
            }
          }
        }

        // Create new GlobalPerson if none matched
        if (!globalPersonId) {
          globalPersonId = this.generateGlobalPersonId();
          const studentRec = matchedStudentId ? this.students.get(matchedStudentId) : null;
          this.global_persons.set(globalPersonId, {
            id: globalPersonId,
            associated_student_id: matchedStudentId || undefined,
            associated_student_name: studentRec?.name,
            seat_id: matchedSeatId || undefined,
            camera_tracks: [],
            current_score: track.current_score || 0,
            cumulative_score: track.cumulative_score || track.suspicion_score || 0,
            warning_latched: track.warning_latched || false,
            last_seen: now,
            status: matchedSeatId ? 'in_seat' : 'unassigned'
          });
        }

        track.global_person_id = globalPersonId;
        const quality = this.computeObservationQuality(track, camera);

        // Record link for this GlobalPerson
        if (!activeGPLinks.has(globalPersonId)) {
          activeGPLinks.set(globalPersonId, []);
        }
        activeGPLinks.get(globalPersonId)!.push({
          camera_id: cameraId,
          track_id: track.track_id,
          quality,
          is_best_view: false,
          bbox: { ...track.bbox },
          track
        });

        // Record observation on formal StudentRecord if associated
        if (matchedStudentId && this.students.has(matchedStudentId)) {
          const student = this.students.get(matchedStudentId)!;
          student.active_observations.push({
            camera_id: cameraId,
            track_id: track.track_id,
            global_person_id: globalPersonId,
            quality,
            is_best_view: false,
            timestamp: now,
            bbox: { ...track.bbox },
            current_score: track.current_score,
            cumulative_score: track.cumulative_score
          });
        }
      }
    }

    // Step 2: Resolve Best Views and Update Global Persons
    for (const [gpId, links] of activeGPLinks.entries()) {
      const gp = this.global_persons.get(gpId);
      if (!gp) continue;

      // Find highest quality view
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

      // Update dual scores on GlobalPerson
      const maxCurrent = Math.max(...links.map(l => l.track.current_score || 0));
      const maxCumulative = Math.max(...links.map(l => l.track.cumulative_score || l.track.suspicion_score || 0));
      gp.current_score = maxCurrent;
      gp.cumulative_score = Math.max(gp.cumulative_score || 0, maxCumulative);

      if (gp.cumulative_score >= 60 || gp.current_score >= 60) {
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

    // Step 3: Determine the Best/Nearest Camera View for each student
    // and calculate unified cross-camera suspicion scores
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

      // Aggregate dual scores with quality weighting
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
        student.unified_suspicion_score = student.cumulative_score;
      }

      if (student.unified_suspicion_score >= 60 || (student.current_score && student.current_score >= 60)) {
        student.status = 'flagged';
      }
    }

    return {
      students: Array.from(this.students.values()),
      globalPersons: Array.from(this.global_persons.values())
    };
  }

  /**
   * Admin action: Unlatch warning alert for a student while preserving the cumulative audit score.
   */
  public clearStudentWarning(student_id: string): void {
    const student = this.students.get(student_id);
    if (student) {
      student.current_score = 0;
      if (student.status === 'flagged') {
        student.status = 'present';
      }
      // Preserve cumulative_score for audit
    }

    for (const gp of this.global_persons.values()) {
      if (gp.associated_student_id === student_id) {
        gp.warning_latched = false;
        gp.current_score = 0;
      }
    }
  }

  public getStudents(): StudentRecord[] {
    return Array.from(this.students.values());
  }

  public getGlobalPersons(): GlobalPerson[] {
    return Array.from(this.global_persons.values());
  }

  public getStudentById(id: string): StudentRecord | null {
    return this.students.get(id) || null;
  }
}
