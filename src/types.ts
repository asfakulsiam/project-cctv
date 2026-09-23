/**
 * src/types.ts - Core TypeScript Interface Definitions
 * Contains data types for Camera Sources, Tracked Candidates, Detection Overlays,
 * Activity Logs, System Diagnostics, Score Configurations, and Application Settings.
 */

export type WarningLevel = 'normal' | 'warning' | 'high';

export interface Candidate {
  id: string; // Canonical P-ID: "P-1", "P-2", etc.
  trackerId: number; // Internal ByteTrack tracker ID
  cameraId: string;
  studentName?: string;
  name?: string; // alias for studentName
  seatNumber?: string;
  firstSeen: string; // ISO date
  lastSeen: string; // ISO date
  currentScore: number; // 0 - 100
  score?: number; // alias for currentScore
  warningLevel: WarningLevel;
  warningCleared: boolean;
  isCurrentlyTracked: boolean;
  activeInFrame?: boolean; // alias for isCurrentlyTracked
  lastActivity?: string;
  notes?: string;
}

export interface ScoreThresholds {
  normalMax: number;
  warningMax: number;
  highMin: number;
}

export interface DetectionOverlayItem {
  trackerId: number;
  pId: string; // Canonical P-ID
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0.0 to 1.0
  pixelBbox?: [number, number, number, number];
  center: [number, number]; // [cx, cy] normalized
  score: number; // 0 - 100
  warningLevel: WarningLevel;
  observedMotion: number;
  detectedActivities: string[];
  isStationary: boolean;
  studentName?: string;
  seatNumber?: string;
}

export interface ActivityRecord {
  id: string;
  pId: string; // P-1, P-2, etc.
  cameraId: string;
  cameraName?: string;
  activityType: string;
  details: string;
  scoreChange: number; // e.g. +8
  scoreAfter: number;
  warningLevel: WarningLevel;
  timestamp: string; // ISO
  timeDisplay: string; // e.g. "10:42:18"
}

export type CameraSourceType =
  | 'rtsp'
  | 'ip_camera'
  | 'stream_url'
  | 'cloud_link'
  | 'file_upload'
  | 'local_file'
  | 'webcam'
  | 'sample'
  | 'file';

export interface CameraSource {
  id: string;
  name: string;
  sourceType: CameraSourceType;
  sourceUrl: string;
  username?: string;
  password?: string;
  resolvedUrl?: string;
  location: string;
  enabled: boolean;
  status: 'active' | 'offline' | 'paused';
  resolution?: string;
  description?: string;
}

export interface ActivityTypeConfig {
  id: string;
  name: string;
  description: string;
  scoreWeight: number; // Points added to candidate score
  severity: 'low' | 'medium' | 'high';
}

export interface ScoreConfig {
  normalMax: number; // e.g. 35
  warningMax: number; // e.g. 70
  highWarningMin: number; // e.g. 71
  maxScore: number; // strictly 100
}

export interface AppSettings {
  appName: string;
  cvModelPath: string;
  confidenceThreshold: number;
  detectionIntervalMs: number;
  adminId: string;
}

export interface SystemDiagnostics {
  cvWorkerStatus: 'online' | 'offline' | 'error';
  modelName: string;
  tracker: string;
  device: string;
  fps: number;
  latencyMs: number;
  activeTracks: number;
  totalCandidates: number;
  activeWarnings: number;
  processedFrames: number;
  lastProcessedTime?: string;
  errorMessage?: string;
}

export interface ProcessFrameResponse {
  camera_id: string;
  timestamp: number;
  frame_width: number;
  frame_height: number;
  detection_count: number;
  active_track_count: number;
  latency_ms: number;
  model_name: string;
  detections: DetectionOverlayItem[];
  new_activities: ActivityRecord[];
  all_candidates: Candidate[];
  diagnostics: SystemDiagnostics;
}
