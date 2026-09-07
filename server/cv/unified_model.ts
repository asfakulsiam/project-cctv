/**
 * Smart Classroom Exam Monitoring System
 * Unified Cross-Camera Student Identity Model & Observation Quality Priority
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. A temporary tracking identity belongs to a specific camera (e.g. CAM1-S001, CAM2-S001).
 *    A permanent student identity belongs to the database/classroom model.
 * 2. When multiple cameras observe the same classroom/student, observations are associated
 *    into ONE unified student record based on configured seat regions and spatial evidence.
 * 3. Never create duplicate students or duplicate permanent IDs when multiple cameras
 *    view the same subject.
 * 4. Determines the clearest/best available camera view (`is_best_view: true`) dynamically
 *    so the UI and monitoring logic prioritize the clearest observation when one angle is occluded.
 */

import { 
  CameraConfig, 
  CameraTrack, 
  SeatRecord, 
  StudentObservation, 
  StudentRecord 
} from '../../src/types.js';

export class UnifiedStudentManager {
  private students: Map<string, StudentRecord> = new Map(); // student_id -> StudentRecord
  private seats: SeatRecord[] = [];

  constructor(initialStudents: StudentRecord[], seats: SeatRecord[]) {
    this.seats = seats;
    for (const student of initialStudents) {
      this.students.set(student.id, {
        ...student,
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
          active_observations: []
        });
      }
    }
  }

  /**
   * Evaluates observation clarity based on camera resolution, visibility, face confidence,
   * and bounding box area (nearer/larger subjects give higher observation clarity).
   */
  private computeObservationQuality(track: CameraTrack, camera: CameraConfig): number {
    // 1. Base camera sensor clarity
    const cameraBase = camera.quality_score * 0.4;

    // 2. Face confidence and visibility factor
    const faceFactor = track.face_visible ? (track.face_confidence * 30) : 5;

    // 3. Normalized bounding box scale (closer camera viewpoint = larger box area)
    const boxArea = track.bbox.width * track.bbox.height;
    // Normalize typical student bbox area (0.05 - 0.25) to a score up to 30
    const scaleFactor = Math.min(30, Math.max(5, (boxArea / 0.15) * 20));

    return Math.min(100, Math.round(cameraBase + faceFactor + scaleFactor));
  }

  /**
   * Process tracks from all active cameras and synthesize into the unified student records.
   * 
   * @param tracksByCamera Map of camera_id -> active tracks
   * @param cameras List of registered cameras
   * @param now Current timestamp
   */
  public syncCrossCameraObservations(
    tracksByCamera: Map<string, CameraTrack[]>,
    cameras: CameraConfig[],
    now: number = Date.now()
  ): StudentRecord[] {
    const cameraMap = new Map<string, CameraConfig>(cameras.map(c => [c.camera_id, c]));

    // Reset temporary active observations on all students
    for (const student of this.students.values()) {
      student.active_observations = [];
    }

    // Associate camera tracks to students via seat mapping or assigned student IDs
    for (const [cameraId, tracks] of tracksByCamera.entries()) {
      const camera = cameraMap.get(cameraId);
      if (!camera || camera.status !== 'online') continue;

      for (const track of tracks) {
        let matchedStudentId: string | null = null;

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
                trackCenterX >= (region.x - 0.05) &&
                trackCenterX <= (region.x + region.width + 0.05) &&
                trackCenterY >= (region.y - 0.05) &&
                trackCenterY <= (region.y + region.height + 0.05);

              if (inside && seat.assigned_student_id && this.students.has(seat.assigned_student_id)) {
                matchedStudentId = seat.assigned_student_id;
                track.seat_id = seat.id;
                track.associated_student_id = matchedStudentId;
                break;
              }
            }
          }
        }

        // If matched to an official student in database:
        if (matchedStudentId) {
          const student = this.students.get(matchedStudentId)!;
          const quality = this.computeObservationQuality(track, camera);

          student.active_observations.push({
            camera_id: cameraId,
            track_id: track.track_id,
            quality,
            is_best_view: false, // Calculated in next step
            timestamp: now,
            bbox: { ...track.bbox }
          });
        }
      }
    }

    // Step 2: Determine the Best/Nearest Camera View for each student
    // and calculate unified cross-camera suspicion score
    for (const student of this.students.values()) {
      if (student.active_observations.length === 0) {
        student.status = 'absent';
        student.unified_suspicion_score = 0;
        continue;
      }

      student.status = 'present';

      // Find highest quality observation
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

      // Aggregate suspicion scores across all camera views with quality weighting
      // If camera 1 sees an occlusion or false shadow, but camera 2 has a high-quality unobstructed view,
      // the higher quality observation grounds the score accurately!
      let weightedScoreSum = 0;
      let totalWeight = 0;

      for (const obs of student.active_observations) {
        const cameraTracks = tracksByCamera.get(obs.camera_id);
        const track = cameraTracks?.find(t => t.track_id === obs.track_id);
        if (track) {
          const weight = obs.quality / 100;
          weightedScoreSum += track.suspicion_score * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight > 0) {
        student.unified_suspicion_score = Math.round(weightedScoreSum / totalWeight);
      }

      if (student.unified_suspicion_score >= 60) {
        student.status = 'flagged';
      }
    }

    return Array.from(this.students.values());
  }

  public getStudents(): StudentRecord[] {
    return Array.from(this.students.values());
  }

  public getStudentById(id: string): StudentRecord | null {
    return this.students.get(id) || null;
  }
}
