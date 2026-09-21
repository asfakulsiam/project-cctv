/**
 * Smart Classroom Exam Monitoring System
 * Real Computer Vision Person & Secondary Object Detector
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. Real Person Detection Gatekeeper:
 *    Only class == 'person' detections with confidence >= threshold enter the tracker.
 *    Non-human objects (chairs, bags, posters, shadows) are rejected.
 * 2. Secondary Object Detection (Cell Phone):
 *    Phones are detected as class == 'cell phone' and linked to the nearest/overlapping
 *    person bounding box (hand/desk zone). Phones NEVER create a person track.
 * 3. Secondary Face & Pose Estimator:
 *    Evaluates head pose and face visibility on the person box. Never creates a person track.
 *    If no face/pose detector is available, confidence is 0 and face_visible is false.
 * 4. Appearance Encoder (Re-ID):
 *    Interface for deep visual feature embeddings. Until an actual vision encoder is connected,
 *    appearance_embedding is strictly undefined — no synthetic positional vectors.
 * 5. Clean Interface Boundary:
 *    PersonDetectorInput -> Frame -> Detection -> Temporal Confirmation -> CameraTracker
 */

import { 
  BoundingBox, 
  HeadDirection, 
  HeadPoseData, 
  HumanDetection, 
  SecondaryObjectDetection 
} from '../../src/types.js';

export interface PersonDetectorInput {
  frame: unknown;
  timestamp: number;
  camera_id: string;
}

export interface DetectorOutput {
  humans: HumanDetection[];
  phones: SecondaryObjectDetection[];
  timestamp: number;
}

export interface AppearanceEncoder {
  encode(
    frame: unknown,
    bbox: BoundingBox
  ): Promise<number[] | undefined>;
}

export interface IdentityEvidence {
  appearance_similarity?: number;
  spatial_similarity?: number;
  seat_match?: boolean;
  temporal_similarity?: number;
}

export class RealPersonDetector {
  private detectionCounter = 1;
  private phoneDetectionCounter = 1;
  private readonly minConfidence: number;
  private appearanceEncoder?: AppearanceEncoder;

  constructor(minConfidence = 0.50, appearanceEncoder?: AppearanceEncoder) {
    this.minConfidence = minConfidence;
    this.appearanceEncoder = appearanceEncoder;
  }

  /**
   * Calculate Cosine Similarity between two Re-ID appearance embeddings.
   * Returns value between 0.0 (completely dissimilar) and 1.0 (identical appearance).
   */
  public static computeCosineSimilarity(emb1?: number[], emb2?: number[]): number {
    if (!emb1 || !emb2 || emb1.length === 0 || emb1.length !== emb2.length) return 0.0;
    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < emb1.length; i++) {
      dot += emb1[i] * emb2[i];
      norm1 += emb1[i] * emb1[i];
      norm2 += emb2[i] * emb2[i];
    }
    const mag = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (mag <= 0) return 0.0;
    return Math.max(0.0, Math.min(1.0, dot / mag));
  }

  /**
   * Generates a unique ephemeral Layer 1 Detection ID.
   * Example: det-000001
   */
  public generateDetectionId(): string {
    const num = String(this.detectionCounter++).padStart(6, '0');
    return `det-${num}`;
  }

  /**
   * Generates a unique ephemeral secondary object ID.
   * Example: phone-det-000001
   */
  public generatePhoneDetectionId(): string {
    const num = String(this.phoneDetectionCounter++).padStart(6, '0');
    return `phone-det-${num}`;
  }

  /**
   * Secondary Object Detector: Cell Phone Association.
   * Associates detected phone with the person bounding box that encompasses it.
   */
  public associatePhoneWithPerson(
    personBox: BoundingBox, 
    phoneBox: BoundingBox
  ): boolean {
    // Check if phone overlaps with person's desk/hand area (lower 65% of person bbox)
    const personBottomArea: BoundingBox = {
      x: personBox.x - 0.05,
      y: personBox.y + personBox.height * 0.35,
      width: personBox.width + 0.10,
      height: personBox.height * 0.70
    };

    const px1 = Math.max(personBottomArea.x, phoneBox.x);
    const py1 = Math.max(personBottomArea.y, phoneBox.y);
    const px2 = Math.min(personBottomArea.x + personBottomArea.width, phoneBox.x + phoneBox.width);
    const py2 = Math.min(personBottomArea.y + personBottomArea.height, phoneBox.y + phoneBox.height);

    const intersection = Math.max(0, px2 - px1) * Math.max(0, py2 - py1);
    const phoneArea = phoneBox.width * phoneBox.height;

    // If at least 30% of the phone is within the person's hand/desk perimeter
    return (phoneArea > 0 && (intersection / phoneArea) >= 0.30);
  }

  /**
   * Primary frame-processing boundary for person and secondary object detection.
   * Accepts either structured PersonDetectorInput or raw video frame with optional detections.
   */
  public async detectFrame(
    frameOrInput: PersonDetectorInput | any,
    cameraId?: string,
    timestamp: number = Date.now(),
    rawDetections: Array<{
      class_name: string;
      confidence: number;
      bbox: BoundingBox;
      head_pose?: HeadPoseData;
      face_visible?: boolean;
      face_confidence?: number;
      seat_id?: string;
      associated_student_id?: string;
      appearance_embedding?: number[];
    }> = [],
    rawPhones: SecondaryObjectDetection[] = []
  ): Promise<HumanDetection[]> {
    if (!frameOrInput) return [];

    // Support extracting embedded detections from frame container if not explicitly passed
    const detections = (rawDetections && rawDetections.length > 0)
      ? rawDetections
      : (frameOrInput.detections || []);

    const phones = (rawPhones && rawPhones.length > 0)
      ? rawPhones
      : (frameOrInput.phones || []);

    return this.processDetections(detections, phones);
  }

  /**
   * Performs real person detection filtering, anatomical validation,
   * secondary phone association, and secondary head pose / face checks.
   *
   * PRESERVES:
   * - seat_id and associated_student_id
   * DOES NOT:
   * - invent biometric confidence
   * - generate fake appearance embeddings
   * - create detections from seat rectangles
   */
  public processDetections(
    rawDetections: Array<{
      class_name: string;
      confidence: number;
      bbox: BoundingBox;
      head_pose?: HeadPoseData;
      face_visible?: boolean;
      face_confidence?: number;
      seat_id?: string;
      associated_student_id?: string;
      appearance_embedding?: number[];
    }>,
    rawPhones: SecondaryObjectDetection[] = []
  ): HumanDetection[] {
    const confirmedHumans: HumanDetection[] = [];

    for (const raw of rawDetections) {
      // 1. Class Gate: Must be class 'person'
      if (!raw.class_name || raw.class_name.toLowerCase() !== 'person') {
        continue;
      }

      // 2. Confidence Gate
      if (raw.confidence < this.minConfidence) {
        continue;
      }

      const bbox = raw.bbox;
      // 3. Anatomical Proportions Validation (seated human morphology)
      if (bbox.width <= 0.02 || bbox.height <= 0.02) continue;
      const aspect = bbox.height / bbox.width;
      if (aspect < 1.15 || aspect > 4.30) continue; // Reject flat or overly elongated anomalies

      const detId = this.generateDetectionId();

      // 4. Secondary Cell Phone Association
      let phoneDetected = false;
      let phoneConfidence = 0;
      let phoneBbox: BoundingBox | undefined = undefined;

      for (const phone of rawPhones) {
        if (phone.class_name === 'cell phone' && this.associatePhoneWithPerson(bbox, phone.bbox)) {
          phoneDetected = true;
          phoneConfidence = phone.confidence;
          phoneBbox = { ...phone.bbox };
          phone.associated_track_id = detId;
          break;
        }
      }

      // 5. Head Pose: do not invent confidence if none provided
      const headPose: HeadPoseData = raw.head_pose || {
        yaw: 0,
        pitch: 0,
        direction: 'center' as HeadDirection,
        confidence: 0
      };

      // 6. Face Visibility & Confidence: do not invent biometric confidence
      const faceVisible = raw.face_visible ?? false;
      const faceConfidence = raw.face_confidence ?? 0;

      // 7. Appearance Embedding: only use real embedding if provided by CV pipeline
      const appearanceEmbedding = raw.appearance_embedding;

      confirmedHumans.push({
        detection_id: detId,
        class_name: 'person',
        confidence: raw.confidence,
        bbox: { ...bbox },
        appearance_embedding: appearanceEmbedding,
        head_pose: headPose,
        face_visible: faceVisible,
        face_confidence: faceConfidence,
        phone_detected: phoneDetected,
        phone_confidence: phoneConfidence,
        phone_bbox: phoneBbox,
        seat_id: raw.seat_id,
        associated_student_id: raw.associated_student_id
      });
    }

    return confirmedHumans;
  }
}
