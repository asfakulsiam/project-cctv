/**
 * Smart Classroom Exam Monitoring System
 * Core Domain Types & Data Contracts
 */

export type CameraStatus = 'online' | 'offline' | 'connecting' | 'error';
export type CameraSourceType = 'rtsp' | 'usb' | 'http' | 'demo' | 'webcam' | 'stream' | 'file';

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

export interface CameraTrack {
  track_id: string;            // Camera-scoped: e.g. "CAM1-S001"
  camera_id: string;           // Parent camera
  bbox: BoundingBox;           // Bounding box in normalized coords (0 to 1)
  confidence: number;          // Detection confidence (0 - 1)
  head_pose: HeadPoseData;
  face_visible: boolean;
  face_confidence: number;
  phone_detected: boolean;
  phone_confidence: number;
  movement_magnitude: number;  // Relative velocity / spatial delta
  is_moving: boolean;
  seat_id?: string;
  associated_student_id?: string;
  suspicion_score: number;     // 0 - 100 explainable score
  last_seen_timestamp: number;
  created_timestamp: number;
  history_trajectory?: Array<{ x: number; y: number; t: number }>;
}

export interface StudentObservation {
  camera_id: string;
  track_id: string;
  quality: number;             // View clarity score (0 - 100)
  is_best_view: boolean;       // Set when this camera has the highest observation clarity
  timestamp: number;
  bbox: BoundingBox;
  suspicion_score?: number;
}

export interface StudentRecord {
  id: string;                  // Database unique ID
  student_id_number: string;   // Formal academic ID (e.g., STU-2026-0812), editable by admin
  name: string;
  classroom_id: string;
  seat_id?: string;
  status: 'present' | 'absent' | 'left_seat' | 'flagged';
  unified_suspicion_score: number; // Cross-camera integrated score (0 - 100)
  active_observations: StudentObservation[];
  notes?: string;
  last_activity?: string;
}

export interface ClassroomRecord {
  id: string;
  name: string;
  code: string;
  capacity: number;
  camera_ids: string[];
}

export interface SeatRecord {
  id: string;
  classroom_id: string;
  seat_label: string;
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
  | 'CAMERA_RECONNECTED';

export type EventSeverity = 'info' | 'warning' | 'high';

export interface BehaviorEvent {
  id: string;
  session_id: string;
  event_type: BehaviorEventType;
  student_id?: string;
  student_id_number?: string;
  student_name?: string;
  camera_id: string;
  track_id?: string;
  timestamp: number;
  confidence: number;
  score_contribution: number;
  severity: EventSeverity;
  description: string;
  metadata?: Record<string, any>;
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
  detected_persons: number;
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
  events?: BehaviorEvent[];
  stats?: SystemStats;
  new_event?: BehaviorEvent;
}
