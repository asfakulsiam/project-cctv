"""
Smart Classroom Exam Monitoring System
Python Independent Camera Worker & Stream Ingestion Pipeline

Architecture Mandate:
Each camera gets its own independent processing pipeline.
Do not combine cameras into a single tracker.
Camera 1 -> Detector -> Tracker #1 -> CAM1-S001, CAM1-S002
Camera 2 -> Detector -> Tracker #2 -> CAM2-S001, CAM2-S002
Camera 3 -> Detector -> Tracker #3 -> CAM3-S001, CAM3-S002

This worker handles:
1. Stream ingestion (RTSP IP Camera, USB Webcam, HTTP MJPEG, or Synthetic Demo)
2. YOLOv8 / MediaPipe Detection & Pose Inference
3. Independent ByteTrack-style association
4. Seat-based physical mapping (Seat A1 -> Student 2026001)
5. Observation Quality scoring (for multi-view Best View selection)
6. Real-time MJPEG video frame generation
"""

import time
import math
import random
from typing import Dict, List, Optional, Tuple
from cv.tracker import PythonCameraTracker, BoundingBox
from cv.behavior_analyzer import PythonBehaviorAnalyzer

class CameraWorker:
    """
    Independent processing pipeline for a single camera.
    Owns video capture, detector, tracker, FPS calculation, connection status, and MJPEG buffer.
    """
    def __init__(self, camera_config: dict, seats: List[dict], students: List[dict]):
        self.camera_id = camera_config["camera_id"]
        self.name = camera_config.get("name", self.camera_id)
        self.source_type = camera_config.get("source_type", "rtsp")  # 'rtsp', 'usb', 'http', 'demo'
        self.source_url = camera_config.get("source_url", "")
        self.classroom_id = camera_config.get("classroom_id", "")
        self.is_primary = camera_config.get("is_primary", False)
        self.enabled = camera_config.get("enabled", True)
        self.target_fps = camera_config.get("target_fps", 15)

        # Seat Mapping dictionary: seat_id -> seat info
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
        self.latency_ms = 18.0
        self.current_tracks: List[dict] = []
        self.current_events: List[dict] = []
        self.latest_jpeg_frame: Optional[bytes] = None

    def map_bbox_to_seat(self, bbox: BoundingBox) -> Optional[Tuple[str, str]]:
        """
        Spatial Seat Mapping:
        Given an observed bounding box center, determine which physical classroom seat it occupies.
        Returns (seat_id, student_id) without requiring facial recognition.
        """
        cx = bbox.x + bbox.width / 2.0
        cy = bbox.y + bbox.height / 2.0

        for seat_id, seat in self.seats_map.items():
            cam_regions = seat.get("camera_regions", {})
            region = cam_regions.get(self.camera_id)
            if region:
                rx = region["x"]
                ry = region["y"]
                rw = region["width"]
                rh = region["height"]
                # Check point in bounding box region
                if rx <= cx <= rx + rw and ry <= cy <= ry + rh:
                    assigned_student_id = seat.get("assigned_student_id")
                    return seat_id, assigned_student_id

        return None

    def calculate_observation_quality(self, bbox: BoundingBox, face_visible: bool, head_pose: str) -> float:
        """
        Calculates observation clarity (0 - 100) for Best View arbitration:
        - Face visibility (+40)
        - Bounding box scale/resolution (+30)
        - Head pose directly toward camera (+20)
        - Optical angle factor (+10)
        """
        quality = 20.0
        if face_visible:
            quality += 45.0
        if head_pose == "center":
            quality += 20.0
        elif head_pose in ("left", "right"):
            quality += 10.0

        # Scale bonus (closer to camera)
        area = bbox.width * bbox.height
        quality += min(15.0, area * 100.0)

        return min(100.0, max(10.0, round(quality, 1)))

    def process_frame(self, raw_detections: List[dict], now: Optional[float] = None) -> dict:
        """
        Executes one processing tick for this camera worker.
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

        # 1. Update isolated tracker
        tracks = self.tracker.update(raw_detections, now=now)

        # 2. Perform Seat Mapping & Behavioral Analysis
        events_this_frame = []
        for t in tracks:
            bbox = t["bbox"]
            if isinstance(bbox, dict):
                b_obj = BoundingBox(bbox["x"], bbox["y"], bbox["width"], bbox["height"])
            else:
                b_obj = bbox

            # Seat association
            seat_info = self.map_bbox_to_seat(b_obj)
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
            t["quality_score"] = self.calculate_observation_quality(b_obj, face_vis, head_dir)

            # Analyze behavior
            events, score = self.analyzer.analyze(t, now=now)
            t["suspicion_score"] = score
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
