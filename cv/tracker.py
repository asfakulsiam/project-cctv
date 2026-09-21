"""
Smart Classroom Exam Monitoring System
Python Computer Vision Engine - Per-Camera Independent Human Tracker

Architectural Invariants:
1. Human Detection is the Gatekeeper: Only confirmed human detections enter the tracker.
2. Independent Per-Camera Context: All track IDs are strictly camera-scoped (e.g. CAM1-S001).
3. Candidate Temporal Buffer: Tracks require multi-frame confirmation before receiving a permanent ID.
4. Stationary Persistence: Tracks never vanish simply because a student sits still.
5. Monotonically Non-Decreasing Suspicion Score: Score never auto-decays; warnings latch until cleared by admin.
"""

from typing import List, Dict, Optional, Tuple
import time
import math

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

    def center_dist(self, other: 'BoundingBox') -> float:
        cx1 = self.x + self.width / 2.0
        cy1 = self.y + self.height / 2.0
        cx2 = other.x + other.width / 2.0
        cy2 = other.y + other.height / 2.0
        return math.hypot(cx1 - cx2, cy1 - cy2)


class PythonCameraTracker:
    """
    Independent tracker instance for a single camera feed.
    Guarantees isolation of track IDs across cameras.
    """
    def __init__(self, camera_id: str, iou_threshold: float = 0.15, max_missed: int = 15):
        self.camera_id = camera_id
        # Derive uppercase alphanumeric prefix (e.g. cam-1 -> CAM1)
        self.camera_prefix = "".join(c for c in camera_id.upper() if c.isalnum())
        self.next_track_num = 1
        self.next_cand_num = 1
        self.active_tracks: Dict[str, dict] = {}
        self.candidate_tracks: Dict[str, dict] = {}
        self.iou_threshold = iou_threshold
        self.max_missed = max_missed

    def generate_track_id(self) -> str:
        """Generates a camera-scoped tracking identifier."""
        tid = f"{self.camera_prefix}-S{self.next_track_num:03d}"
        self.next_track_num += 1
        return tid

    def update(self, human_detections: List[dict], now: Optional[float] = None) -> List[dict]:
        """
        Updates the track pool with confirmed human detections using multi-frame confirmation.
        """
        if now is None:
            now = time.time()

        # Enforce Rule 1: Human-First Gatekeeper
        valid_humans = [
            d for d in human_detections 
            if d.get("class_name", "person") == "person" and d.get("confidence", 0.0) >= 0.60
        ]

        if not valid_humans:
            # Handle empty room / frame
            for tid, track in list(self.active_tracks.items()):
                track["missed_frames"] += 1
                track["status"] = "lost"
                track["is_moving"] = False
                track["movement_magnitude"] = 0
                if track["missed_frames"] > self.max_missed:
                    del self.active_tracks[tid]
            self.candidate_tracks.clear()
            return self._export_tracks()

        matched_active_ids = set()
        matched_cand_ids = set()
        unmatched_dets = []

        # Step 1: Match with Active Tracks
        for det in valid_humans:
            bbox: BoundingBox = det["bbox"]
            best_id = None
            best_score = 0.0

            for tid, track in self.active_tracks.items():
                if tid in matched_active_ids:
                    continue
                iou = track["bbox"].iou(bbox)
                dist = track["bbox"].center_dist(bbox)
                if iou >= self.iou_threshold or dist <= 0.35:
                    score = iou * 0.6 + max(0.0, 1.0 - dist / 0.35) * 0.4
                    if score > best_score:
                        best_score = score
                        best_id = tid

            if best_id:
                matched_active_ids.add(best_id)
                track = self.active_tracks[best_id]
                alpha = 0.35
                track["bbox"].x = track["bbox"].x * (1 - alpha) + bbox.x * alpha
                track["bbox"].y = track["bbox"].y * (1 - alpha) + bbox.y * alpha
                track["bbox"].width = track["bbox"].width * (1 - alpha) + bbox.width * alpha
                track["bbox"].height = track["bbox"].height * (1 - alpha) + bbox.height * alpha
                track["confidence"] = det.get("confidence", 0.9)
                track["head_pose"] = det.get("head_pose", track.get("head_pose", {"direction": "center"}))
                track["face_visible"] = det.get("face_visible", track.get("face_visible", True))
                track["phone_detected"] = det.get("phone_detected", False)
                track["phone_confidence"] = det.get("phone_confidence", 0.0)
                track["status"] = "active"
                track["missed_frames"] = 0
                track["last_seen"] = now

                # Suspicion Score non-decreasing update
                contrib = det.get("score_contribution", 0)
                if contrib > 0:
                    track["suspicion_score"] = min(100, max(track["suspicion_score"], track["suspicion_score"] + contrib))
                    if track["suspicion_score"] >= 65:
                        track["warning_latched"] = True
            else:
                unmatched_dets.append(det)

        # Step 2: Match with Candidate Buffer
        still_unmatched = []
        for det in unmatched_dets:
            bbox = det["bbox"]
            best_cand_id = None
            best_score = 0.0
            for cid, cand in self.candidate_tracks.items():
                if cid in matched_cand_ids:
                    continue
                iou = cand["bbox"].iou(bbox)
                dist = cand["bbox"].center_dist(bbox)
                if iou >= self.iou_threshold or dist <= 0.35:
                    score = iou * 0.5 + max(0.0, 1.0 - dist / 0.35) * 0.5
                    if score > best_score:
                        best_score = score
                        best_cand_id = cid

            if best_cand_id:
                matched_cand_ids.add(best_cand_id)
                cand = self.candidate_tracks[best_cand_id]
                cand["hits"] += 1
                cand["missed"] = 0
                cand["bbox"] = bbox
                if cand["hits"] >= 3:
                    del self.candidate_tracks[best_cand_id]
                    perm_id = self.generate_track_id()
                    cand["track_id"] = perm_id
                    cand["status"] = "active"
                    cand["suspicion_score"] = 0
                    cand["warning_latched"] = False
                    cand["missed_frames"] = 0
                    cand["last_seen"] = now
                    cand["is_confirmed_human"] = True
                    self.active_tracks[perm_id] = cand
            else:
                still_unmatched.append(det)

        # Step 3: Spawn New Candidates
        for det in still_unmatched:
            cid = f"cand_{self.next_cand_num}"
            self.next_cand_num += 1
            self.candidate_tracks[cid] = {
                "track_id": cid,
                "camera_id": self.camera_id,
                "bbox": det["bbox"],
                "confidence": det.get("confidence", 0.8),
                "head_pose": det.get("head_pose", {"direction": "center"}),
                "face_visible": det.get("face_visible", True),
                "phone_detected": det.get("phone_detected", False),
                "phone_confidence": det.get("phone_confidence", 0.0),
                "hits": 1,
                "missed": 0,
                "created_at": now,
                "status": "candidate"
            }

        # Step 4: Prune candidates and mark lost tracks
        for cid, cand in list(self.candidate_tracks.items()):
            if cid not in matched_cand_ids:
                cand["missed"] += 1
                if cand["missed"] > 2:
                    del self.candidate_tracks[cid]

        for tid, track in list(self.active_tracks.items()):
            if tid not in matched_active_ids:
                track["missed_frames"] += 1
                track["status"] = "lost"
                track["is_moving"] = False
                track["movement_magnitude"] = 0
                if track["missed_frames"] > self.max_missed:
                    del self.active_tracks[tid]

        return self._export_tracks()

    def clear_track_warning(self, track_id: str) -> None:
        """Admin action: Unlatch warning without decreasing suspicion score."""
        if track_id in self.active_tracks:
            self.active_tracks[track_id]["warning_latched"] = False

    def reset_track_score(self, track_id: str) -> None:
        """Admin action: Reset score for a track."""
        if track_id in self.active_tracks:
            self.active_tracks[track_id]["suspicion_score"] = 0
            self.active_tracks[track_id]["warning_latched"] = False

    def _export_tracks(self) -> List[dict]:
        return [
            track for track in self.active_tracks.values()
            if track["status"] == "active" or (track["status"] == "lost" and track["missed_frames"] <= 6)
        ]
