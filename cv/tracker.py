"""
Smart Classroom Exam Monitoring System
Python Computer Vision Engine - Per-Camera Independent Human Tracker

Architectural Invariants:
1. Human Detection is the Gatekeeper: Only confirmed human detections enter the tracker.
2. Independent Per-Camera Context: All track IDs are strictly camera-scoped (e.g. CAM1-S001).
3. Layer 1, 2, 3 Identity Architecture:
   - Layer 1: Ephemeral per-frame Detection ID (det_xxx)
   - Layer 2: Camera-scoped Track ID (e.g. CAM1-S001)
   - Layer 3: Cross-camera Global Person ID (e.g. P-001)
4. Dual Scoring & Monotonically Non-Decreasing Cumulative Score:
   - current_score: Immediate window anomaly score (0 - 100)
   - cumulative_score: Monotonically non-decreasing audit score (0 - 100)
5. Stationary Persistence: Tracks never vanish simply because a student sits still.
6. Admin Clearance: Unlatches warnings and resets current_score without decreasing cumulative_score.
"""

from typing import List, Dict, Optional, Union
import time
import math

class BoundingBox:
    def __init__(self, x: float, y: float, width: float, height: float):
        self.x = float(x)
        self.y = float(y)
        self.width = float(width)
        self.height = float(height)

    def to_dict(self) -> Dict[str, float]:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}

    def iou(self, other: Union['BoundingBox', dict]) -> float:
        ox = other["x"] if isinstance(other, dict) else other.x
        oy = other["y"] if isinstance(other, dict) else other.y
        ow = other["width"] if isinstance(other, dict) else other.width
        oh = other["height"] if isinstance(other, dict) else other.height

        x1 = max(self.x, ox)
        y1 = max(self.y, oy)
        x2 = min(self.x + self.width, ox + ow)
        y2 = min(self.y + self.height, oy + oh)

        intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        area1 = self.width * self.height
        area2 = ow * oh
        union = area1 + area2 - intersection

        if union <= 0:
            return 0.0
        return intersection / union

    def center_dist(self, other: Union['BoundingBox', dict]) -> float:
        ox = other["x"] if isinstance(other, dict) else other.x
        oy = other["y"] if isinstance(other, dict) else other.y
        ow = other["width"] if isinstance(other, dict) else other.width
        oh = other["height"] if isinstance(other, dict) else other.height

        cx1 = self.x + self.width / 2.0
        cy1 = self.y + self.height / 2.0
        cx2 = ox + ow / 2.0
        cy2 = oy + oh / 2.0
        return math.hypot(cx1 - cx2, cy1 - cy2)


class PythonCameraTracker:
    """
    Independent tracker instance for a single camera feed.
    Guarantees isolation of track IDs across cameras.
    """
    def __init__(self, camera_id: str, iou_threshold: float = 0.14, max_missed: int = 18, confirmation_hits: int = 1):
        self.camera_id = camera_id
        # Derive uppercase alphanumeric prefix (e.g. cam-1 -> CAM1)
        self.camera_prefix = "".join(c for c in camera_id.upper() if c.isalnum())
        self.next_track_num = 1
        self.next_cand_num = 1
        self.active_tracks: Dict[str, dict] = {}
        self.candidate_tracks: Dict[str, dict] = {}
        self.iou_threshold = iou_threshold
        self.max_missed = max_missed
        self.confirmation_hits = confirmation_hits

    def generate_track_id(self) -> str:
        """Generates a camera-scoped tracking identifier."""
        tid = f"{self.camera_prefix}-S{self.next_track_num:03d}"
        self.next_track_num += 1
        return tid

    def update(self, human_detections: List[dict], now: Optional[float] = None) -> List[dict]:
        """
        Updates the track pool with confirmed human detections.
        """
        if now is None:
            now = time.time()

        # Enforce Rule 1: Human-First Gatekeeper
        valid_humans = []
        for d in human_detections:
            if d.get("class_name", "person") == "person" and d.get("confidence", 0.0) >= 0.55:
                # Wrap bbox if dict
                bbox_raw = d["bbox"]
                if isinstance(bbox_raw, dict):
                    b_obj = BoundingBox(bbox_raw["x"], bbox_raw["y"], bbox_raw["width"], bbox_raw["height"])
                else:
                    b_obj = bbox_raw
                valid_humans.append({**d, "bbox": b_obj})

        if not valid_humans:
            # Handle empty room / frame: Decay missed frames, retain stationary context
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
                # Adaptive association threshold based on bbox size
                max_dist = max(0.20, min(0.45, math.hypot(track["bbox"].width, track["bbox"].height) * 0.75))

                if iou >= self.iou_threshold or dist <= max_dist:
                    score = iou * 0.6 + max(0.0, 1.0 - dist / max_dist) * 0.4
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

                # Preserve or adopt global_person_id (Layer 3)
                if det.get("global_person_id"):
                    track["global_person_id"] = det["global_person_id"]

                # Dual score update: non-decreasing cumulative score
                contrib = det.get("score_contribution", 0)
                if contrib > 0:
                    track["current_score"] = min(100, (track.get("current_score", 0) + contrib))
                    track["cumulative_score"] = min(100, max(track.get("cumulative_score", 0), track["cumulative_score"] + contrib))
                    track["suspicion_score"] = track["cumulative_score"]
                    if track["cumulative_score"] >= 60 or track["current_score"] >= 60:
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
                if cand["hits"] >= self.confirmation_hits:
                    del self.candidate_tracks[best_cand_id]
                    perm_id = self.generate_track_id()
                    cand["track_id"] = perm_id
                    cand["status"] = "active"
                    cand["current_score"] = 0
                    cand["cumulative_score"] = 0
                    cand["suspicion_score"] = 0
                    cand["warning_latched"] = False
                    cand["missed_frames"] = 0
                    cand["last_seen"] = now
                    cand["is_confirmed_human"] = True
                    self.active_tracks[perm_id] = cand
            else:
                still_unmatched.append(det)

        # Step 3: Spawn New Candidates (or promote immediately if confirmation_hits <= 1)
        for det in still_unmatched:
            if self.confirmation_hits <= 1:
                perm_id = self.generate_track_id()
                self.active_tracks[perm_id] = {
                    "track_id": perm_id,
                    "camera_id": self.camera_id,
                    "global_person_id": det.get("global_person_id"),
                    "bbox": det["bbox"],
                    "confidence": det.get("confidence", 0.85),
                    "head_pose": det.get("head_pose", {"direction": "center"}),
                    "face_visible": det.get("face_visible", True),
                    "phone_detected": det.get("phone_detected", False),
                    "phone_confidence": det.get("phone_confidence", 0.0),
                    "current_score": 0,
                    "cumulative_score": 0,
                    "suspicion_score": 0,
                    "warning_latched": False,
                    "status": "active",
                    "hits": 1,
                    "missed_frames": 0,
                    "last_seen": now,
                    "is_confirmed_human": True,
                    "is_moving": False,
                    "movement_magnitude": 0
                }
            else:
                cid = f"cand_{self.next_cand_num}"
                self.next_cand_num += 1
                self.candidate_tracks[cid] = {
                    "track_id": cid,
                    "camera_id": self.camera_id,
                    "global_person_id": det.get("global_person_id"),
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

    def set_track_suspicion(self, track_id: str, suspicion_score: int, current_score: Optional[int] = None) -> None:
        """Sets suspicion score with non-decreasing guarantee for cumulative score."""
        if track_id in self.active_tracks:
            track = self.active_tracks[track_id]
            if current_score is not None:
                track["current_score"] = current_score
            track["cumulative_score"] = min(100, max(track.get("cumulative_score", 0), suspicion_score))
            track["suspicion_score"] = track["cumulative_score"]
            if track["cumulative_score"] >= 60 or track.get("current_score", 0) >= 60:
                track["warning_latched"] = True

    def clear_track_warning(self, track_id: str) -> None:
        """
        Admin action: Unlatch warning and reset immediate risk without decreasing cumulative score.
        Invariant: Cumulative score is preserved for audit trail.
        """
        if track_id in self.active_tracks:
            track = self.active_tracks[track_id]
            track["warning_latched"] = False
            track["current_score"] = 0
            track["warning_cleared_at"] = time.time()

    def reset_track_score(self, track_id: str) -> None:
        """Full admin reset if explicitly requested."""
        if track_id in self.active_tracks:
            self.active_tracks[track_id]["current_score"] = 0
            self.active_tracks[track_id]["cumulative_score"] = 0
            self.active_tracks[track_id]["suspicion_score"] = 0
            self.active_tracks[track_id]["warning_latched"] = False

    def _export_tracks(self) -> List[dict]:
        return [
            track for track in self.active_tracks.values()
            if track["status"] == "active" or (track["status"] == "lost" and track["missed_frames"] <= 6)
        ]
