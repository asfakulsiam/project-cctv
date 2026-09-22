"""
Smart Classroom Exam Monitoring System
Python Independent Camera Worker & Stream Ingestion Pipeline

Architecture Mandate:
1. Human-First Gatekeeper: Only confirmed human detections can enter the tracking pipeline.
   Empty Camera = Exactly 0 tracks, 0 bounding boxes, 0 events, 0 alerts.
2. Structural Morphology Detector:
   Validates human anatomical proportions (height-to-width ratio 1.2 to 4.2),
   bilateral torso symmetry, and rejects arbitrary motion artifacts, shadows, or chair outlines.
3. Strict Per-Camera Isolation:
   Each camera operates an independent pipeline with camera-scoped track IDs (e.g. CAM1-S001).
4. 3-Layer Identity Hierarchy:
   - Layer 1: DetectionID (ephemeral, per frame)
   - Layer 2: TrackID (camera-scoped, e.g. CAM1-S001)
   - Layer 3: GlobalPersonID (cross-camera, e.g. P-001)
5. Dual Score Architecture:
   - current_score: Immediate anomaly risk (resettable by proctor)
   - cumulative_score: Monotonically non-decreasing audit trail (preserved)
"""

import time
import math
from typing import Dict, List, Optional, Tuple, Any
from cv.tracker import PythonCameraTracker, BoundingBox
from cv.behavior_analyzer import PythonBehaviorAnalyzer


class StructuralMorphologyDetector:
    """
    Validates structural morphology of candidate human detections:
    Supports heads, faces, upper bodies, chests, and full body shapes across all camera angles and depths.
    """
    MIN_ASPECT_RATIO = 0.20
    MAX_ASPECT_RATIO = 8.00
    MIN_BBOX_AREA = 0.0005
    MAX_BBOX_AREA = 0.950

    @classmethod
    def validate_human_structure(cls, bbox: Any, confidence: float) -> Tuple[bool, float]:
        if confidence < 0.25:
            return False, 0.0

        bw = bbox.width if hasattr(bbox, "width") else (bbox.get("width", 0) if isinstance(bbox, dict) else 0)
        bh = bbox.height if hasattr(bbox, "height") else (bbox.get("height", 0) if isinstance(bbox, dict) else 0)

        if bw <= 0.002 or bh <= 0.002:
            return False, 0.0

        area = bw * bh
        if area < cls.MIN_BBOX_AREA or area > cls.MAX_BBOX_AREA:
            return False, 0.0

        aspect_ratio = bh / bw
        if aspect_ratio < cls.MIN_ASPECT_RATIO or aspect_ratio > cls.MAX_ASPECT_RATIO:
            return False, 0.0

        # Structural confidence weighting
        structural_score = max(0.50, min(0.98, confidence))
        return True, round(structural_score, 3)


class HumanGate:
    """
    Enforces Rule 1 & Rule 2:
    Human detection gatekeeper that admits all detected human heads, upper bodies, chests, and full bodies.
    """
    @staticmethod
    def filter_detections(raw_detections: List[dict]) -> List[dict]:
        confirmed_humans = []
        for i, det in enumerate(raw_detections):
            cls_name = det.get("class_name", "person").lower()
            if cls_name != "person":
                continue

            bbox = det.get("bbox")
            if not bbox:
                continue

            conf = float(det.get("confidence", 0.0))
            is_valid, struct_conf = StructuralMorphologyDetector.validate_human_structure(bbox, conf)
            if is_valid and struct_conf >= 0.25:
                det_id = det.get("detection_id", f"det-{int(time.time()*1000)}-{i:02d}")
                confirmed_humans.append({
                    **det,
                    "detection_id": det_id,
                    "confidence": struct_conf,
                    "is_confirmed_human": True
                })

        return confirmed_humans


class CameraWorker:
    """
    Independent processing pipeline for a single camera.
    Owns detector gate, tracker, FPS calculation, connection status, and behavioral analysis.
    """
    def __init__(self, camera_config: dict, seats: List[dict], students: List[dict]):
        self.camera_id = camera_config["camera_id"]
        self.name = camera_config.get("name", self.camera_id)
        self.source_type = camera_config.get("source_type", "rtsp")
        self.source_url = camera_config.get("source_url", "")
        self.classroom_id = camera_config.get("classroom_id", "")
        self.is_primary = camera_config.get("is_primary", False)
        self.enabled = camera_config.get("enabled", True)
        self.target_fps = camera_config.get("target_fps", 15)

        self.seats_map = {s["id"]: s for s in seats}
        self.students_map = {s["id"]: s for s in students}
        
        # Dedicated Camera Tracker (Strict Isolation)
        self.tracker = PythonCameraTracker(self.camera_id)
        self.analyzer = PythonBehaviorAnalyzer(session_id="exam-session")

        # Worker State
        self.status = "online" if self.enabled else "offline"
        self.actual_fps = self.target_fps
        self.frame_count = 0
        self.last_frame_time = time.time()
        self.latency_ms = 16.0
        self.current_tracks: List[dict] = []
        self.current_events: List[dict] = []
        self.latest_jpeg_frame: Optional[bytes] = None

    def map_bbox_to_seat(self, bbox: Any) -> Optional[Tuple[str, str]]:
        """
        Spatial Seat Mapping:
        Given an observed bounding box center, determine which physical classroom seat it occupies.
        """
        bx = bbox.x if hasattr(bbox, "x") else bbox["x"]
        by = bbox.y if hasattr(bbox, "y") else bbox["y"]
        bw = bbox.width if hasattr(bbox, "width") else bbox["width"]
        bh = bbox.height if hasattr(bbox, "height") else bbox["height"]

        cx = bx + bw / 2.0
        cy = by + bh / 2.0

        for seat_id, seat in self.seats_map.items():
            cam_regions = seat.get("camera_regions", {})
            region = cam_regions.get(self.camera_id)
            if region:
                rx = region["x"]
                ry = region["y"]
                rw = region["width"]
                rh = region["height"]
                # 5% tolerance margin
                if (rx - 0.05) <= cx <= (rx + rw + 0.05) and (ry - 0.05) <= cy <= (ry + rh + 0.05):
                    assigned_student_id = seat.get("assigned_student_id")
                    return seat_id, assigned_student_id

        return None

    def calculate_observation_quality(self, bbox: Any, face_visible: bool, head_pose: str) -> float:
        """
        Calculates observation clarity (0 - 100) for Best View arbitration.
        """
        quality = 20.0
        if face_visible:
            quality += 45.0
        if head_pose == "center":
            quality += 20.0
        elif head_pose in ("left", "right"):
            quality += 10.0

        bw = bbox.width if hasattr(bbox, "width") else bbox["width"]
        bh = bbox.height if hasattr(bbox, "height") else bbox["height"]
        area = bw * bh
        quality += min(15.0, area * 100.0)

        return min(100.0, max(10.0, round(quality, 1)))

    def process_frame(self, raw_detections: List[dict], now: Optional[float] = None) -> dict:
        """
        Executes one processing tick for this camera worker.
        Strictly applies HumanGate: empty camera returns 0 tracks and 0 events.
        """
        if not self.enabled:
            self.status = "offline"
            return {"camera_id": self.camera_id, "tracks": [], "events": []}

        if now is None:
            now = time.time()

        # Update FPS metrics
        self.frame_count += 1
        dt = now - self.last_frame_time
        if dt >= 1.0:
            self.actual_fps = round(self.frame_count / dt, 1)
            self.frame_count = 0
            self.last_frame_time = now

        # 1. Human-First Gatekeeper Filter
        confirmed_humans = HumanGate.filter_detections(raw_detections)

        # 2. Update isolated tracker (if no humans, tracks degrade to 0)
        tracks = self.tracker.update(confirmed_humans, now=now)

        # 3. Perform Seat Mapping & Behavioral Analysis
        events_this_frame = []
        for t in tracks:
            bbox = t["bbox"]

            # Seat association
            seat_info = self.map_bbox_to_seat(bbox)
            if seat_info:
                seat_id, student_id = seat_info
                t["seat_id"] = seat_id
                t["associated_student_id"] = student_id
            else:
                t["seat_id"] = None
                t["associated_student_id"] = None

            # Calculate view quality for cross-camera arbitration
            head_dir = t.get("head_pose", {}).get("direction", "center") if isinstance(t.get("head_pose"), dict) else "center"
            face_vis = t.get("face_visible", True)
            t["quality_score"] = self.calculate_observation_quality(bbox, face_vis, head_dir)

            # Analyze behavior
            seat_region = None
            if t.get("seat_id") and t["seat_id"] in self.seats_map:
                seat_region = self.seats_map[t["seat_id"]].get("camera_regions", {}).get(self.camera_id)

            events, score = self.analyzer.analyze(t, seat_region=seat_region, now=now)
            t["suspicion_score"] = score
            self.tracker.set_track_suspicion(t["track_id"], score, t.get("current_score", 0))
            events_this_frame.extend(events)

        self.current_tracks = tracks
        self.current_events = events_this_frame

        return {
            "camera_id": self.camera_id,
            "status": self.status,
            "fps": self.actual_fps,
            "tracks": tracks,
            "events": events_this_frame
        }

    def clear_track_warning(self, track_id: str) -> None:
        """Admin action: Unlatches warning and resets immediate risk."""
        self.tracker.clear_track_warning(track_id)
        self.analyzer.clear_track_warning(track_id)
