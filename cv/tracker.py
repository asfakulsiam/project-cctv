"""
Smart Classroom Exam Monitoring System
Python Computer Vision Engine - Per-Camera Independent Object Tracker

Architectural Requirement:
Each camera stream maintains its own independent tracking context.
Track IDs are explicitly scoped (e.g. CAM1-S001, CAM2-S001) preventing collisions.
"""

from typing import List, Dict, Optional, Tuple
import time

class BoundingBox:
    def __init__(self, x: float, y: float, width: float, height: float):
        self.x = x
        self.y = y
        self.width = width
        self.height = height

    def to_dict(self) -> Dict[str, float]:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}

    def iou(self, other: 'BoundingBox') -> float:
        x1 = max(self.x, other.x)
        y1 = max(self.y, other.y)
        x2 = min(self.x + self.width, other.x + other.width)
        y2 = min(self.y + self.height, other.y + other.height)

        intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        area1 = self.width * self.height
        area2 = other.width * other.height
        union = area1 + area2 - intersection

        if union <= 0:
            return 0.0
        return intersection / union


class PythonCameraTracker:
    """
    Independent tracker instance for a single camera feed.
    Guarantees isolation of track IDs across cameras.
    """
    def __init__(self, camera_id: str, iou_threshold: float = 0.25, max_missed: int = 15):
        self.camera_id = camera_id
        # Derive uppercase alphanumeric prefix (e.g. cam-1 -> CAM1)
        self.camera_prefix = "".join(c for c in camera_id.upper() if c.isalnum())
        self.next_track_num = 1
        self.active_tracks: Dict[str, dict] = {}
        self.iou_threshold = iou_threshold
        self.max_missed = max_missed

    def generate_track_id(self) -> str:
        """Generates a camera-scoped tracking identifier."""
        tid = f"{self.camera_prefix}-S{self.next_track_num:03d}"
        self.next_track_num += 1
        return tid

    def update(self, detections: List[dict], now: Optional[float] = None) -> List[dict]:
        """
        Updates the track pool with raw detections using IoU association and temporal smoothing.
        
        :param detections: List of dicts containing bbox (BoundingBox), confidence, head_pose, etc.
        :param now: Optional timestamp in seconds
        :return: List of active track states
        """
        if now is None:
            now = time.time()

        matched_ids = set()
        unmatched_dets = []

        # IoU matching against active tracks
        for det in detections:
            bbox: BoundingBox = det["bbox"]
            best_id = None
            best_iou = self.iou_threshold

            for tid, track in self.active_tracks.items():
                if tid in matched_ids:
                    continue
                score = track["bbox"].iou(bbox)
                if score > best_iou:
                    best_iou = score
                    best_id = tid

            if best_id:
                matched_ids.add(best_id)
                track = self.active_tracks[best_id]
                # EMA smoothing
                alpha = 0.35
                track["bbox"].x = track["bbox"].x * (1 - alpha) + bbox.x * alpha
                track["bbox"].y = track["bbox"].y * (1 - alpha) + bbox.y * alpha
                track["bbox"].width = track["bbox"].width * (1 - alpha) + bbox.width * alpha
                track["bbox"].height = track["bbox"].height * (1 - alpha) + bbox.height * alpha
                track["confidence"] = det.get("confidence", 0.9)
                track["head_pose"] = det.get("head_pose", track.get("head_pose", "center"))
                track["face_visible"] = det.get("face_visible", track.get("face_visible", True))
                track["phone_detected"] = det.get("phone_detected", False)
                track["phone_confidence"] = det.get("phone_confidence", 0.0)
                track["seat_id"] = det.get("seat_id", track.get("seat_id"))
                track["associated_student_id"] = det.get("associated_student_id", track.get("associated_student_id"))
                track["last_seen"] = now
                track["missed"] = 0
            else:
                unmatched_dets.append(det)

        # Create new tracks for unmatched detections
        for det in unmatched_dets:
            new_id = self.generate_track_id()
            self.active_tracks[new_id] = {
                "track_id": new_id,
                "camera_id": self.camera_id,
                "bbox": det["bbox"],
                "confidence": det.get("confidence", 0.9),
                "head_pose": det.get("head_pose", "center"),
                "face_visible": det.get("face_visible", True),
                "phone_detected": det.get("phone_detected", False),
                "phone_confidence": det.get("phone_confidence", 0.0),
                "seat_id": det.get("seat_id"),
                "associated_student_id": det.get("associated_student_id"),
                "suspicion_score": 5,
                "created_at": now,
                "last_seen": now,
                "missed": 0
            }

        # Age and remove lost tracks
        to_delete = []
        for tid, track in self.active_tracks.items():
            if tid not in matched_ids:
                track["missed"] += 1
                if track["missed"] > self.max_missed:
                    to_delete.append(tid)

        for tid in to_delete:
            del self.active_tracks[tid]

        return list(self.active_tracks.values())
