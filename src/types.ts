export type CameraSourceType = 'rtsp' | 'http' | 'mjpeg' | 'gdrive' | 'webcam' | 'mp4';

export interface CameraConfig {
  camera_id: string;
  name: string;
  source_type: CameraSourceType;
  source_url: string;
  classroom_id: string;
  status: 'online' | 'offline' | 'error';
  is_primary: boolean;
  enabled: boolean;
  resolution: { width: number; height: number };
  target_fps: number;
  actual_fps: number;
  quality_score: number;
  view_angle_description?: string;
  monitored_seats?: string[];
}

export interface Student {
  id: string;
  student_id_number: string;
  name: string;
  classroom_id?: string;
  seat_id?: string;
  status: 'present' | 'absent' | 'moving' | 'warning' | 'cheating_alert' | 'flagged';
  unified_suspicion_score: number;
  current_score?: number;
  cumulative_score?: number;
  max_score?: number;
  active_observations: string[];
  notes?: string;
  person_id?: string | null;
  global_person_id?: string | null;
  warning_cleared_at?: number;
  avatar_url?: string;
}

export interface Seat {
  seat_id: string;
  classroom_id: string;
  row: number;
  column: number;
  label: string;
  x?: number;
  y?: number;
  assigned_student_id?: string;
}

export interface Classroom {
  id: string;
  name: string;
  building?: string;
  room_number?: string;
  total_seats?: number;
}

export interface ExamSession {
  id: string;
  title: string;
  status: 'scheduled' | 'active' | 'completed' | 'paused';
  start_time: number;
  end_time?: number;
  course_code?: string;
  proctor_name?: string;
}

export interface ExamEvent {
  id: string;
  session_id: string;
  event_type: string;
  student_id?: string;
  person_id?: string;
  global_person_id?: string;
  camera_id?: string;
  track_id?: string;
  student_id_number?: string;
  student_name?: string;
  timestamp: number;
  confidence: number;
  score_contribution: number;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata?: Record<string, any>;
}

export interface SystemSettings {
  system_name: string;
  anomaly_sensitivity: number;
  warning_threshold: number;
  critical_threshold: number;
  thresholds?: {
    warning?: number;
    critical?: number;
    suspicious_movement?: number;
    high_suspicion_threshold?: number;
    warning_suspicion_threshold?: number;
  };
  default_primary_camera?: string;
  auto_unlatch_time_sec?: number;
  dark_mode_default?: boolean;
}

export interface ExamCandidate {
  person_id: string;
  global_person_id: string;
  student_id: string | null;
  student_name?: string;
  student_id_number?: string;
  current_camera_id: string;
  bbox: { x: number; y: number; width: number; height: number };
  head_point?: { x: number; y: number };
  suspicion_score: number;
  warning_active: boolean;
  status: 'normal' | 'warning' | 'critical';
  last_seen: number;
  seat_id?: string;
  notes?: string;
}

export interface GlobalPerson extends ExamCandidate {}

export interface CameraTrack {
  track_id: string;
  camera_id: string;
  person_id: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  head_point?: { x: number; y: number };
  suspicion_score: number;
  warning_active: boolean;
  last_updated: number;
}

export interface TelemetryPayload {
  timestamp: number;
  fps: number;
  cameras: CameraConfig[];
  tracks: Record<string, CameraTrack[]>;
  candidates: ExamCandidate[];
  students: Student[];
  recent_events: ExamEvent[];
  stats: {
    total_cameras: number;
    online_cameras: number;
    detected_persons: number;
    active_tracks: number;
    unique_global_persons: number;
    present_students: number;
    students_moving: number;
    warning_count: number;
    high_suspicion_count: number;
    active_alerts: number;
    processing_fps: number;
    system_health: string;
  };
}
