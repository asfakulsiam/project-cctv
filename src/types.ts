/**
 * Smart Classroom Exam Monitoring System
 * Core Domain Types & Data Contracts
 */

export type CameraStatus = 'online' | 'offline' | 'connecting' | 'error';
export type CameraSourceType = 'rtsp' | 'usb' | 'http' | 'demo' | 'webcam' | 'stream' | 'file' | 'ip_webcam';

export interface CameraConfig {
  camera_id: string;
  name: string;
  source_type: CameraSourceType;
  source_url: string;
  classroom_id: string;
  status: CameraStatus;
  is_primary: boolean;
  enabled: boolean;
  resolution: {
    width: number;
    height: number;
  };
  target_fps: number;
  actual_fps: number;
  quality_score: number; // 0 - 100 based on clarity, lighting, angle
  error_message?: string;
  view_angle_description?: string;
  monitored_seats?: string[];
}

export type HeadDirection = 'center' | 'left' | 'right' | 'up' | 'down';

export interface HeadPoseData {
  yaw: number;
  pitch: number;
  direction: HeadDirection;
  confidence: number;
}

export interface BoundingBox {
  x: number;      // 0 - 1 normalized or pixel
  y: number;      // 0 - 1 normalized or pixel
  width: number;  // 0 - 1 normalized or pixel
  height: number; // 0 - 1 normalized or pixel
}

export type DetectionClass = 'person' | 'cell phone' | 'other';

export interface CandidateEvidence {
  detectionCount: number;
  firstSeen: number;
  lastSeen: number;
  confidenceMean: number;
  confidenceMin: number;
  centerVariance: number;
  sizeVariance: number;
  appearanceConsistency: number;
  detectorAgreement: number;
}

export type WarningLevel = 'normal' | 'warning' | 'critical';

export function getWarningLevel(
  score: number,
  thresholds?: MonitoringThresholds
): WarningLevel {
  const high = thresholds?.high_suspicion_threshold ?? 65;
  const warning = thresholds?.warning_suspicion_threshold ?? 35;
  if (score >= high) return 'critical';
  if (score >= warning) return 'warning';
  return 'normal';
}

export interface HumanDetection {
  detection_id?: string;       // Layer 1: Ephemeral detection ID (e.g. "det-000001")
  class_name: 'person';
  confidence: number;
  bbox: BoundingBox;
  appearance_embedding?: number[]; // Re-ID visual descriptor vector (undefined until real encoder is connected)
  head_pose?: HeadPoseData;
  face_visible?: boolean;
  face_confidence?: number;
  phone_detected?: boolean;
  phone_confidence?: number;
  phone_bbox?: BoundingBox;
  seat_id?: string;
  associated_student_id?: string;
  global_person_id?: string;
}

export interface SecondaryObjectDetection {
  detection_id: string;        // e.g. "phone-det-000001"
  class_name: 'cell phone';
  confidence: number;
  bbox: BoundingBox;
  associated_track_id?: string;
}

export interface CameraTrack {
  track_id: string;            // Layer 2: Camera-scoped track ID: e.g. "CAM1-T001"
  camera_id: string;           // Parent camera ID
  person_id?: string;          // Layer 3: Person ID (e.g. "P-001")
  global_person_id?: string;   // Backward-compatible alias for person_id
  bbox: BoundingBox;           // Bounding box in normalized coords (0 to 1)
  confidence: number;          // Detection confidence (0 - 1)
  appearance_embedding?: number[]; // Re-ID appearance descriptor vector
  head_pose: HeadPoseData;
  face_visible: boolean;
  face_occluded?: boolean;
  face_confidence: number;
  phone_detected: boolean;
  phone_confidence: number;
  phone_bbox?: BoundingBox;
  movement_magnitude: number;  // Relative velocity / spatial delta
  is_moving: boolean;
  is_confirmed_human: boolean; // Guaranteed true human invariant (passed detector & temporal evidence)
  seat_id?: string;
  associated_student_id?: string;
  suspicion_score: number;     // Suspicion score (0 - 100)
  current_score?: number;      // Current immediate behavioral anomaly risk window (0 - 100, resettable)
  cumulative_score?: number;   // Cumulative non-decreasing suspicion score for audit (0 - 100)
  max_score?: number;          // Peak instantaneous current_score reached
  warning_level?: WarningLevel;// Centralized warning level (normal | warning | critical)
  warning_latched?: boolean;   // Latched warning state until explicit admin clearance
  warning_cleared_at?: number;
  last_seen_timestamp: number;
  created_timestamp: number;
  history_trajectory?: Array<{ x: number; y: number; t: number }>;
}

export interface GlobalPersonObservation {
  camera_id: string;
  track_id: string;
  bbox: BoundingBox;
  quality: number;
  last_seen: number;
}

export interface GlobalPerson {
  id: string;                    // Primary Layer 3 ID (e.g. "P-001")
  person_id?: string;            // Layer 3 Person ID (e.g. "P-001")
  global_person_id?: string;     // Alias for id / person_id
  classroom_id?: string;
  seat_id?: string;
  active?: boolean;
  primary_camera_id?: string;
  appearance_embedding?: number[]; // Running average visual appearance embedding
  camera_tracks?: Array<{
    camera_id: string;
    track_id: string;
    quality: number;
    is_best_view: boolean;
  }>;
  current_score: number;         // Immediate penalty (resettable by admin)
  cumulative_score: number;      // Lifetime non-decreasing penalty
  max_score?: number;            // Highest peak score
  warning_latched: boolean;
  warning_latched_time?: number; // Timestamp when warning became latched
  warning_cleared_at?: number;   // Timestamp when warning was manually cleared by proctor
  observations?: Record<string, GlobalPersonObservation>;
  first_seen?: number;
  last_seen: number;
  notes?: string;
  status?: 'active' | 'in_seat' | 'left_seat' | 'unassigned';
}

export type PersonIdentity = GlobalPerson;

export interface StudentObservation {
  camera_id: string;
  track_id: string;
  global_person_id?: string;
  quality: number;             // View clarity score (0 - 100)
  is_best_view: boolean;       // Set when this camera has the highest observation clarity
  timestamp: number;
  bbox: BoundingBox;
  suspicion_score?: number;
  current_score?: number;
  cumulative_score?: number;
  max_score?: number;
}

export interface StudentRecord {
  id: string;                  // Database unique ID
  student_id_number: string;   // Formal academic ID (e.g., STU-2026-0812), editable by admin
  name: string;
  classroom_id: string;
  person_id?: string;          // Associated Person ID (e.g., P-001)
  global_person_id?: string;   // Backward-compatible alias for person_id
  seat_id?: string;
  status: 'present' | 'absent' | 'left_seat' | 'flagged';
  unified_suspicion_score: number; // Cross-camera integrated score (0 - 100)
  current_score?: number;          // Current behavioral anomaly risk (0 - 100)
  cumulative_score?: number;       // Monotonically non-decreasing audit score (0 - 100)
  max_score?: number;              // Peak score reached
  warning_level?: WarningLevel;    // Centralized warning level (normal | warning | critical)
  warning_latched_time?: number;   // Timestamp when warning was triggered
  warning_cleared_at?: number;     // Timestamp when warning was administratively cleared
  active_observations: StudentObservation[];
  notes?: string;
  last_activity?: string;
}

export interface ClassroomRecord {
  id: string;
  name: string;
  code: string;
  building?: string;
  capacity: number;
  camera_ids: string[];
}

export interface SeatRecord {
  id: string;
  classroom_id: string;
  seat_label: string;
  seat_number?: string;
  grid_row: number;
  grid_col: number;
  // Normalized bounding polygon / box coordinates mapped to specific cameras
  camera_regions: Record<string, BoundingBox>;
  assigned_student_id?: string;
}

export type BehaviorEventType =
  | 'PERSON_DETECTED'
  | 'PERSON_MISSING'
  | 'FACE_NOT_VISIBLE'
  | 'PHONE_DETECTED'
  | 'MULTIPLE_PERSON'
  | 'LEFT_SEAT'
  | 'RETURNED_TO_SEAT'
  | 'LOOKING_LEFT'
  | 'LOOKING_RIGHT'
  | 'LOOKING_UP'
  | 'LOOKING_DOWN'
  | 'REPEATED_LOOKING'
  | 'ABNORMAL_MOVEMENT'
  | 'CAMERA_OFFLINE'
  | 'CAMERA_RECONNECTED'
  | 'WARNING_CLEARED';

export type EventSeverity = 'info' | 'warning' | 'high';

export interface BehaviorEvent {
  id: string;
  session_id: string;
  event_type: BehaviorEventType;
  student_id?: string;
  student_id_number?: string;
  student_name?: string;
  camera_id?: string;
  track_id?: string;
  global_person_id?: string;
  timestamp: number;
  confidence: number;
  score_contribution: number;
  current_score?: number;
  cumulative_score?: number;
  severity: EventSeverity;
  description: string;
  metadata?: Record<string, any>;
  evidence?: {
    bbox?: BoundingBox;
    detector_confidence?: number;
    duration_ms?: number;
    snapshot_url?: string;
  };
}

export interface ExamSession {
  id: string;
  title: string;
  course_code: string;
  classroom_id: string;
  status: 'scheduled' | 'active' | 'completed' | 'paused';
  start_time: number;
  end_time?: number;
  invigilator: string;
}

export interface SuspicionWeights {
  face_hidden: number;
  phone_detected: number;
  repeated_looking: number;
  leaving_seat: number;
  multiple_persons: number;
  abnormal_movement: number;
}

export interface MonitoringThresholds {
  looking_duration_sec: number;
  face_hidden_duration_sec: number;
  leave_seat_grace_sec: number;
  phone_confidence_min: number;
  high_suspicion_threshold: number;
  warning_suspicion_threshold: number;
  movement_threshold_px: number;
  min_person_confidence?: number;
}

export interface AppSettings {
  id: string;
  app_name: string;
  app_logo_text: string;
  app_description: string;
  classroom_display_title: string;
  default_primary_camera: string;
  suspicion_weights: SuspicionWeights;
  thresholds: MonitoringThresholds;
  processing_fps: number;
  allow_public_classroom_display: boolean;
}

export interface SystemStats {
  total_cameras: number;
  online_cameras: number;
  detected_persons: number;        // Unique global persons
  active_tracks?: number;          // Total active camera tracks across all cameras
  unique_global_persons?: number;  // Explicit alias for unique global persons
  present_students: number;
  students_moving: number;
  warning_count: number;
  high_suspicion_count: number;
  active_alerts: number;
  processing_fps: number;
  system_health: 'optimal' | 'warning' | 'degraded' | 'offline';
}

export interface RealtimeFramePayload {
  camera_id: string;
  timestamp: number;
  frame_width: number;
  frame_height: number;
  tracks: CameraTrack[];
  frame_jpeg?: string; // Optional base64 snapshot
}

export interface RealtimeStateMessage {
  type: 'TELEMETRY_UPDATE' | 'EVENT' | 'CAMERA_STATUS' | 'INITIAL_SYNC';
  timestamp: number;
  cameras?: CameraConfig[];
  tracks_by_camera?: Record<string, CameraTrack[]>;
  students?: StudentRecord[];
  global_persons?: GlobalPerson[];
  events?: BehaviorEvent[];
  stats?: SystemStats;
  new_event?: BehaviorEvent;
}
