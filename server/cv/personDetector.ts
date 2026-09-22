/**
 * Smart Classroom Exam Monitoring System
 * Real Computer Vision Person & Secondary Object Detector
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. Real Person Detection Gatekeeper:
 *    Only class == 'person' detections with confidence >= threshold enter the tracker.
 *    Non-human objects (chairs, bags, posters, shadows) are rejected.
 * 2. True Temporal Confirmation Layer:
 *    RAW DETECTION -> TEMPORAL BUFFER -> TEMPORAL CONSISTENCY ANALYSIS -> CONFIRMED PERSON -> TRACKER.
 *    Single-frame noise or transient false positives are strictly rejected.
 *    Stationary seated students remain consistently confirmed without requiring movement.
 * 3. Candidate Deletion Suppression:
 *    When a candidate is deleted by Admin, their spatial footprint is temporarily suppressed
 *    to prevent immediate 1-tick re-creation from the same continuous observation chain.
 * 4. Secondary Object Detection (Cell Phone):
 *    Phones are detected as class == 'cell phone' and linked to the nearest/overlapping
 *    person bounding box (hand/desk zone). Phones NEVER create a person track.
 * 5. Face & Head Pose Analysis:
 *    Evaluates head pose and face visibility on the person box.
 *    If face/pose data is unavailable or confidence is 0, it is NOT treated as face-hidden.
 * 6. Pluggable Production Adapter:
 *    Clean adapter abstraction for external inference engines (YOLO, ONNX, Python worker).
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
  detections?: RawDetectionPayload[];
  phones?: SecondaryObjectDetection[];
}

export interface RawDetectionPayload {
  class_name: string;
  confidence: number;
  bbox: BoundingBox;
  head_pose?: HeadPoseData;
  face_visible?: boolean;
  face_confidence?: number;
  seat_id?: string;
  associated_student_id?: string;
  appearance_embedding?: number[];
  associated_track_id?: string;
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

export interface PersonDetectorAdapter {
  name: string;
  detect(input: PersonDetectorInput): Promise<DetectorOutput>;
}

/**
 * Production Adapter for External Vision Inference Workers (e.g. YOLOv8 / ONNX / RT-DETR).
 * Ingests external inference outputs or proxies frame payloads to high-performance CV workers.
 */
export class ExternalInferenceWorkerAdapter implements PersonDetectorAdapter {
  public name = 'ExternalInferenceWorkerAdapter';
  private inferenceUrl: string;
  private workerOnline = false;
  private lastInferenceLatencyMs = 0;
  private totalCalls = 0;
  private lastError: string | null = null;
  private pendingInferenceByCamera: Map<string, boolean> = new Map();
  private lastInferenceTimeByCamera: Map<string, number> = new Map();

  constructor(inferenceUrl?: string) {
    if (inferenceUrl) {
      this.inferenceUrl = inferenceUrl;
    } else if (process.env.PYTHON_WORKER_URL) {
      this.inferenceUrl = process.env.PYTHON_WORKER_URL;
    } else if (process.env.CV_INFERENCE_URL) {
      this.inferenceUrl = process.env.CV_INFERENCE_URL;
    } else {
      const host = process.env.PYTHON_WORKER_HOST || '127.0.0.1';
      const port = process.env.PYTHON_WORKER_PORT || process.env.CV_WORKER_PORT || process.env.CV_PORT || process.env.PYTHON_PORT || '5001';
      this.inferenceUrl = `http://${host}:${port}/detect`;
    }
  }

  public getDiagnostics() {
    return {
      adapter_name: this.name,
      inference_url: this.inferenceUrl,
      worker_online: this.workerOnline,
      last_latency_ms: this.lastInferenceLatencyMs,
      total_calls: this.totalCalls,
      last_error: this.lastError
    };
  }

  public async detect(input: PersonDetectorInput): Promise<DetectorOutput> {
    this.totalCalls++;
    const startTime = Date.now();
    const cameraId = input.camera_id || 'default';

    // Throttle & prevent queuing duplicate requests per camera if worker request is already in-flight
    if (this.pendingInferenceByCamera.get(cameraId)) {
      return this.fallbackOutput(input);
    }

    const lastTime = this.lastInferenceTimeByCamera.get(cameraId) || 0;
    if (startTime - lastTime < 90) { // Max 11 FPS per camera to preserve memory
      return this.fallbackOutput(input);
    }

    if (this.inferenceUrl && input.frame) {
      this.pendingInferenceByCamera.set(cameraId, true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1800);

        const framePayload: any = input.frame;
        let formattedFrame: string | undefined = undefined;
        if (typeof framePayload === 'string') {
          formattedFrame = framePayload;
        } else if (Buffer.isBuffer(framePayload)) {
          formattedFrame = framePayload.toString('base64');
        } else if (framePayload && Buffer.isBuffer(framePayload.buffer)) {
          formattedFrame = framePayload.buffer.toString('base64');
        } else if (framePayload && typeof framePayload.buffer === 'string') {
          formattedFrame = framePayload.buffer;
        } else if (framePayload && typeof framePayload.frame === 'string') {
          formattedFrame = framePayload.frame;
        } else if (framePayload && Buffer.isBuffer(framePayload.frame)) {
          formattedFrame = framePayload.frame.toString('base64');
        }

        const response = await fetch(this.inferenceUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            camera_id: input.camera_id,
            timestamp: input.timestamp,
            frame: formattedFrame
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        formattedFrame = undefined; // Help V8 garbage collection

        this.lastInferenceLatencyMs = Date.now() - startTime;

        if (response.ok) {
          const data: any = await response.json();
          this.workerOnline = true;
          this.lastError = null;

          if (Array.isArray(data.detections)) {
            const humans: HumanDetection[] = data.detections
              .filter((d: any) => (d.class_name?.toLowerCase() === 'person' || d.class === 'person') && d.confidence >= 0.40)
              .map((d: any) => ({
                class_name: 'person' as const,
                confidence: d.confidence,
                bbox: { ...d.bbox },
                head_pose: d.head_pose,
                face_visible: d.face_visible,
                face_confidence: d.face_confidence,
                appearance_embedding: d.appearance_embedding,
                seat_id: d.seat_id,
                associated_student_id: d.associated_student_id
              }));

            const phones: SecondaryObjectDetection[] = (data.phones || data.detections.filter((d: any) => d.class_name === 'cell phone' || d.class === 'cell phone'))
              .map((p: any, idx: number) => ({
                detection_id: p.detection_id || `ext-phone-${idx}`,
                class_name: 'cell phone' as const,
                confidence: p.confidence,
                bbox: { ...p.bbox },
                associated_track_id: p.associated_track_id
              }));

            return {
              humans,
              phones,
              timestamp: input.timestamp
            };
          }
        } else {
          this.workerOnline = false;
          this.lastError = `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (err: any) {
        this.workerOnline = false;
        this.lastError = err.message || 'Python inference worker connection failed';
      } finally {
        this.pendingInferenceByCamera.delete(cameraId);
        this.lastInferenceTimeByCamera.set(cameraId, Date.now());
      }
    }

    return this.fallbackOutput(input);
  }

  private fallbackOutput(input: PersonDetectorInput): DetectorOutput {
    const rawDetections = input.detections || [];
    const rawPhones = input.phones || [];

    const humans: HumanDetection[] = rawDetections
      .filter(d => d.class_name?.toLowerCase() === 'person' && d.confidence >= 0.40)
      .map(d => ({
        class_name: 'person' as const,
        confidence: d.confidence,
        bbox: { ...d.bbox },
        head_pose: d.head_pose,
        face_visible: d.face_visible,
        face_confidence: d.face_confidence,
        appearance_embedding: d.appearance_embedding,
        seat_id: d.seat_id,
        associated_student_id: d.associated_student_id
      }));

    return {
      humans,
      phones: rawPhones,
      timestamp: input.timestamp
    };
  }
}

export interface IdentityEvidence {
  appearance_similarity?: number;
  spatial_similarity?: number;
  seat_match?: boolean;
  temporal_similarity?: number;
}

/**
 * Temporal Consistency Configuration
 */
export interface TemporalConfirmationConfig {
  minObservations: number;       // Minimum required matching observations across time (default 2)
  minPersistenceMs: number;      // Minimum duration (ms) from first to latest observation (default 250ms)
  maxCenterDist: number;         // Normalized Euclidean center tolerance between frames (default 0.15)
  minSizeRatio: number;          // Bounding box area & aspect consistency ratio (default 0.35)
  maxWindowMs: number;           // Temporal ring-buffer retention window (default 3000ms)
  maxFramesPerCamera: number;    // Maximum buffered frames per camera (default 45)
  suppressionCooldownMs: number; // Duration to suppress re-entry of deleted candidate (default 4000ms)
}

/**
 * Bounded in-memory temporal frame observation
 */
export interface BufferedFrameObservation {
  timestamp: number;
  camera_id: string;
  rawCandidates: RawDetectionPayload[];
  phones: SecondaryObjectDetection[];
}

export interface SuppressedIdentity {
  personId: string;
  seatId?: string;
  bbox?: BoundingBox;
  suppressedAt: number;
  expiresAt: number;
}

/**
 * Bounded in-memory temporal frame buffer
 * Retains only a short 1.5 - 3.0s window to prevent memory accumulation on continuous 24/7 CCTV.
 */
export class TemporalObservationBuffer {
  private buffer: Map<string, BufferedFrameObservation[]> = new Map(); // camera_id -> observations
  private readonly maxWindowMs: number;
  private readonly maxFramesPerCamera: number;

  constructor(maxWindowMs = 3000, maxFramesPerCamera = 45) {
    this.maxWindowMs = maxWindowMs;
    this.maxFramesPerCamera = maxFramesPerCamera;
  }

  public push(cameraId: string, observation: BufferedFrameObservation): void {
    let list = this.buffer.get(cameraId);
    if (!list) {
      list = [];
      this.buffer.set(cameraId, list);
    }
    list.push(observation);

    // Evict observations older than maxWindowMs or exceeding max capacity
    const cutoff = observation.timestamp - this.maxWindowMs;
    const filtered = list.filter(item => item.timestamp >= cutoff);
    if (filtered.length > this.maxFramesPerCamera) {
      filtered.splice(0, filtered.length - this.maxFramesPerCamera);
    }
    this.buffer.set(cameraId, filtered);
  }

  public getRecent(cameraId: string): BufferedFrameObservation[] {
    return this.buffer.get(cameraId) || [];
  }

  public clear(cameraId?: string): void {
    if (cameraId) {
      this.buffer.delete(cameraId);
    } else {
      this.buffer.clear();
    }
  }

  public removeMatching(cameraId: string, predicate: (raw: RawDetectionPayload) => boolean): void {
    const list = this.buffer.get(cameraId);
    if (!list) return;
    for (const obs of list) {
      obs.rawCandidates = obs.rawCandidates.filter(c => !predicate(c));
    }
  }

  public getAllCameraIds(): string[] {
    return Array.from(this.buffer.keys());
  }

  public removeMatchingAll(predicate: (raw: RawDetectionPayload) => boolean): void {
    for (const list of this.buffer.values()) {
      for (const obs of list) {
        obs.rawCandidates = obs.rawCandidates.filter(c => !predicate(c));
      }
    }
  }
}

export class RealPersonDetector {
  private detectionCounter = 1;
  private phoneDetectionCounter = 1;
  private minConfidence: number;
  private appearanceEncoder?: AppearanceEncoder;
  private customAdapter?: PersonDetectorAdapter;
  private temporalBuffer: TemporalObservationBuffer;
  private config: TemporalConfirmationConfig;
  private suppressedIdentities: Map<string, SuppressedIdentity> = new Map();

  constructor(
    minConfidence = 0.50, 
    appearanceEncoder?: AppearanceEncoder,
    config?: Partial<TemporalConfirmationConfig>
  ) {
    this.minConfidence = minConfidence;
    this.appearanceEncoder = appearanceEncoder;
    this.config = {
      minObservations: config?.minObservations ?? 2,
      minPersistenceMs: config?.minPersistenceMs ?? 250,
      maxCenterDist: config?.maxCenterDist ?? 0.15,
      minSizeRatio: config?.minSizeRatio ?? 0.35,
      maxWindowMs: config?.maxWindowMs ?? 3000,
      maxFramesPerCamera: config?.maxFramesPerCamera ?? 45,
      suppressionCooldownMs: config?.suppressionCooldownMs ?? 4000
    };
    this.temporalBuffer = new TemporalObservationBuffer(
      this.config.maxWindowMs,
      this.config.maxFramesPerCamera
    );

    // Register standard production inference adapter by default
    this.customAdapter = new ExternalInferenceWorkerAdapter();
  }

  public setMinConfidence(minConfidence: number): void {
    this.minConfidence = minConfidence;
  }

  public setAdapter(adapter: PersonDetectorAdapter): void {
    this.customAdapter = adapter;
  }

  public clearTemporalBuffer(cameraId?: string): void {
    this.temporalBuffer.clear(cameraId);
  }

  /**
   * Temporarily suppress candidate re-creation after administrative deletion.
   * Clears past temporal observations dynamically across all registered cameras.
   */
  public suppressCandidate(
    personId: string, 
    seatId?: string, 
    bbox?: BoundingBox, 
    durationMs: number = 4000,
    cameraIds?: string[]
  ): void {
    const now = Date.now();
    this.suppressedIdentities.set(personId, {
      personId,
      seatId,
      bbox: bbox ? { ...bbox } : undefined,
      suppressedAt: now,
      expiresAt: now + durationMs
    });

    const isMatch = (raw: RawDetectionPayload) => {
      if (seatId && raw.seat_id === seatId) return true;
      if (bbox && raw.bbox) {
        const centerDist = Math.hypot(
          (raw.bbox.x + raw.bbox.width / 2) - (bbox.x + bbox.width / 2),
          (raw.bbox.y + raw.bbox.height / 2) - (bbox.y + bbox.height / 2)
        );
        if (centerDist < 0.12) return true;
      }
      return false;
    };

    // Remove matching past observations dynamically across all camera buffers
    const targetCameras = cameraIds && cameraIds.length > 0
      ? cameraIds
      : this.temporalBuffer.getAllCameraIds();

    for (const cameraId of targetCameras) {
      this.temporalBuffer.removeMatching(cameraId, isMatch);
    }
    // Also remove across all in-memory buffers
    this.temporalBuffer.removeMatchingAll(isMatch);
  }

  public clearSuppression(): void {
    this.suppressedIdentities.clear();
  }

  private isSuppressed(raw: RawDetectionPayload, now: number): boolean {
    if (this.suppressedIdentities.size === 0) return false;

    // Prune expired suppression records
    for (const [id, sup] of this.suppressedIdentities.entries()) {
      if (now >= sup.expiresAt) {
        this.suppressedIdentities.delete(id);
      }
    }

    const bbox = raw.bbox;
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    for (const sup of this.suppressedIdentities.values()) {
      if (sup.seatId && raw.seat_id && sup.seatId === raw.seat_id) {
        return true;
      }
      if (sup.bbox) {
        const supCx = sup.bbox.x + sup.bbox.width / 2;
        const supCy = sup.bbox.y + sup.bbox.height / 2;
        const dist = Math.hypot(cx - supCx, cy - supCy);
        if (dist < 0.12) {
          return true;
        }
      }
    }

    return false;
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
   * Spatial Non-Maximum Suppression (NMS)
   * Deduplicates multiple candidate detection boxes covering the same human subject.
   */
  public static applySpatialNMS(
    candidates: RawDetectionPayload[], 
    iouThreshold = 0.45,
    centerDistThreshold = 0.045
  ): RawDetectionPayload[] {
    if (candidates.length <= 1) return candidates;

    const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
    const selected: RawDetectionPayload[] = [];

    for (const cand of sorted) {
      let keep = true;
      const b1 = cand.bbox;
      const c1x = b1.x + b1.width / 2;
      const c1y = b1.y + b1.height / 2;

      for (const existing of selected) {
        const b2 = existing.bbox;
        const c2x = b2.x + b2.width / 2;
        const c2y = b2.y + b2.height / 2;

        const x1 = Math.max(b1.x, b2.x);
        const y1 = Math.max(b1.y, b2.y);
        const x2 = Math.min(b1.x + b1.width, b2.x + b2.width);
        const y2 = Math.min(b1.y + b1.height, b2.y + b2.height);

        const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const area1 = b1.width * b1.height;
        const area2 = b2.width * b2.height;
        const unionArea = area1 + area2 - interArea;
        const iou = unionArea > 0 ? interArea / unionArea : 0;

        const centerDist = Math.hypot(c1x - c2x, c1y - c2y);

        if (iou > iouThreshold || centerDist < centerDistThreshold) {
          keep = false;
          break;
        }
      }

      if (keep) {
        selected.push(cand);
      }
    }

    return selected;
  }

  public generateDetectionId(): string {
    const num = String(this.detectionCounter++).padStart(6, '0');
    return `det-${num}`;
  }

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
   * Implements strict temporal confirmation pipeline:
   * RAW FRAME / DETECTION -> TEMPORAL BUFFER -> CONSISTENCY ANALYSIS -> CONFIRMED PERSON.
   */
  public async detectFrame(
    frameOrInput: PersonDetectorInput | any,
    cameraId?: string,
    timestamp: number = Date.now(),
    rawDetections: RawDetectionPayload[] = [],
    rawPhones: SecondaryObjectDetection[] = []
  ): Promise<HumanDetection[]> {
    if (!frameOrInput) return [];

    const camId = cameraId || frameOrInput.camera_id || 'cam-default';

    // 1. Gather raw detections from external payload or frame input
    let detections: RawDetectionPayload[] = (rawDetections && rawDetections.length > 0)
      ? rawDetections
      : (frameOrInput.detections || []);

    let phones: SecondaryObjectDetection[] = (rawPhones && rawPhones.length > 0)
      ? rawPhones
      : (frameOrInput.phones || []);

    // If a custom model adapter is active and no raw detections are provided, query it
    if (this.customAdapter && detections.length === 0) {
      try {
        const output = await this.customAdapter.detect({
          frame: frameOrInput,
          timestamp,
          camera_id: camId,
          detections,
          phones
        });
        if (output.humans && output.humans.length > 0) {
          detections = output.humans.map(h => ({
            class_name: 'person',
            confidence: h.confidence,
            bbox: h.bbox,
            head_pose: h.head_pose,
            face_visible: h.face_visible,
            face_confidence: h.face_confidence,
            seat_id: h.seat_id,
            associated_student_id: h.associated_student_id,
            appearance_embedding: h.appearance_embedding
          }));
        }
        if (output.phones && output.phones.length > 0) {
          phones = output.phones;
        }
      } catch (err) {
        console.warn(`[PersonDetector] Adapter ${this.customAdapter.name} error:`, err);
      }
    }

    // 2. Anatomical Gatekeeper: filter non-human classes, low confidence, and invalid proportions
    const rawValid: RawDetectionPayload[] = [];
    for (const raw of detections) {
      if (!raw.class_name || raw.class_name.toLowerCase() !== 'person') continue;
      if (typeof raw.confidence !== 'number' || raw.confidence < 0.25) continue;

      const bbox = raw.bbox;
      if (!bbox || typeof bbox.x !== 'number' || typeof bbox.y !== 'number') continue;
      if (bbox.width <= 0.005 || bbox.height <= 0.005) continue;

      // Seated / standing human anatomical aspect ratio filter
      const aspect = bbox.height / bbox.width;
      if (aspect < 0.20 || aspect > 8.0) continue;

      // Filter out administratively suppressed identities
      if (this.isSuppressed(raw, timestamp)) continue;

      rawValid.push(raw);
    }

    // Apply Spatial Non-Maximum Suppression (NMS) to eliminate duplicate boxes on same student
    // Tight centerDistThreshold (0.045) preserves adjacent students in classroom seating rows
    const validCandidates = RealPersonDetector.applySpatialNMS(rawValid, 0.45, 0.045);

    // 3. Push valid candidates into the temporal frame ring buffer
    this.temporalBuffer.push(camId, {
      timestamp,
      camera_id: camId,
      rawCandidates: validCandidates,
      phones
    });

    // 4. TEMPORAL CONSISTENCY ANALYSIS & CONFIRMATION
    // Evaluate whether candidate has consistent evidence over time
    const recentObservations = this.temporalBuffer.getRecent(camId);
    const confirmedHumans: HumanDetection[] = [];

    for (const current of validCandidates) {
      const isConfirmed = this.evaluateTemporalConsistency(current, timestamp, recentObservations);
      if (!isConfirmed) {
        // Single-frame noise or insufficient persistence -> reject from tracker input
        continue;
      }

      const detId = this.generateDetectionId();

      // Associate Secondary Object (Cell Phone)
      let phoneDetected = false;
      let phoneConfidence = 0;
      let phoneBbox: BoundingBox | undefined = undefined;

      for (const phone of phones) {
        if (phone.class_name === 'cell phone' && this.associatePhoneWithPerson(current.bbox, phone.bbox)) {
          phoneDetected = true;
          phoneConfidence = phone.confidence;
          phoneBbox = { ...phone.bbox };
          phone.associated_track_id = detId;
          break;
        }
      }

      // Head Pose: do not invent confidence if none provided
      const headPose: HeadPoseData = current.head_pose || {
        yaw: 0,
        pitch: 0,
        direction: 'center' as HeadDirection,
        confidence: 0
      };

      const faceVisible = current.face_visible ?? false;
      const faceConfidence = current.face_confidence ?? 0;
      const appearanceEmbedding = current.appearance_embedding;

      confirmedHumans.push({
        detection_id: detId,
        class_name: 'person',
        confidence: current.confidence,
        bbox: { ...current.bbox },
        appearance_embedding: appearanceEmbedding,
        head_pose: headPose,
        face_visible: faceVisible,
        face_confidence: faceConfidence,
        phone_detected: phoneDetected,
        phone_confidence: phoneConfidence,
        phone_bbox: phoneBbox,
        seat_id: current.seat_id,
        associated_student_id: current.associated_student_id
      });
    }

    return confirmedHumans;
  }

  /**
   * Evaluates temporal consistency across buffered frame observations.
   * Answers: "Has this candidate remained consistent over multiple observations to confirm a real human?"
   * 
   * Stationary seated students match consecutive frames effortlessly because their center & bbox
   * remain stable, keeping them continuously confirmed without requiring motion.
   */
  private evaluateTemporalConsistency(
    candidate: RawDetectionPayload,
    currentTimestamp: number,
    recentObservations: BufferedFrameObservation[]
  ): boolean {
    if (recentObservations.length === 0) return false;

    const candBbox = candidate.bbox;
    const candCx = candBbox.x + candBbox.width / 2;
    const candCy = candBbox.y + candBbox.height / 2;
    const candArea = candBbox.width * candBbox.height;

    let matchingObservationsCount = 0;
    let earliestMatchTime = currentTimestamp;
    let confidenceSum = 0;

    for (const obs of recentObservations) {
      // Find matching candidate in this historical frame observation
      let foundMatchInFrame = false;
      for (const prev of obs.rawCandidates) {
        const prevBbox = prev.bbox;
        const prevCx = prevBbox.x + prevBbox.width / 2;
        const prevCy = prevBbox.y + prevBbox.height / 2;
        const prevArea = prevBbox.width * prevBbox.height;

        const centerDistance = Math.hypot(candCx - prevCx, candCy - prevCy);
        const areaRatio = Math.min(candArea, prevArea) / Math.max(candArea, prevArea);

        // Matching criteria: Center proximity + bounding box scale consistency
        if (centerDistance <= this.config.maxCenterDist && areaRatio >= this.config.minSizeRatio) {
          foundMatchInFrame = true;
          confidenceSum += prev.confidence;
          if (obs.timestamp < earliestMatchTime) {
            earliestMatchTime = obs.timestamp;
          }
          break;
        }
      }

      if (foundMatchInFrame) {
        matchingObservationsCount++;
      }
    }

    const timeSpanMs = currentTimestamp - earliestMatchTime;
    const avgConfidence = matchingObservationsCount > 0 ? (confidenceSum / matchingObservationsCount) : 0;

    // Strict Multi-Frame Temporal Confirmation:
    // Requires:
    // 1. Multi-frame matching observation count (at least minObservations >= 2)
    // 2. Minimum temporal persistence span (>= minPersistenceMs or >= 3 frames)
    // 3. Average detection confidence meeting threshold
    // Stationary seated students confirm naturally without movement because their stable center & area
    // match consecutive frames cleanly.
    if (matchingObservationsCount >= this.config.minObservations && 
        (timeSpanMs >= this.config.minPersistenceMs || matchingObservationsCount >= 3) &&
        avgConfidence >= this.minConfidence) {
      return true;
    }

    return false;
  }
}
