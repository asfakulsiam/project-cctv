"""
Smart Classroom Exam Monitoring System
Python Computer Vision Engine - Behavioral Analysis & Dual Suspicion Scoring

Applies temporal thresholds, duration persistence, glance cooldowns,
and generates explainable Dual Suspicion Scores (0 - 100):
- current_score: Immediate anomaly penalty sum (resettable by proctor)
- cumulative_score: Monotonically non-decreasing audit score (preserved)
"""

from typing import List, Dict, Tuple, Optional
import time

class PythonBehaviorAnalyzer:
    def __init__(self, session_id: str = "academic-exam"):
        self.session_id = session_id
        # Thresholds in seconds
        self.looking_duration_sec = 3.5
        self.face_hidden_duration_sec = 4.0
        self.leave_seat_grace_sec = 5.0
        self.phone_confidence_min = 0.65

        # Weights
        self.weights = {
            "face_hidden": 20,
            "phone_detected": 40,
            "repeated_looking": 25,
            "leaving_seat": 30,
            "abnormal_movement": 15
        }

        # Track temporal context: track_id -> dict
        self.contexts: Dict[str, dict] = {}

    def _get_context(self, track_id: str, now: float) -> dict:
        if track_id not in self.contexts:
            self.contexts[track_id] = {
                "gaze": "center",
                "gaze_started_at": now,
                "gaze_alerted": False,
                "turn_count": 0,
                "last_turn_time": now,
                "last_repeated_alert": 0.0,
                "face_hidden_since": None,
                "face_hidden_alerted": False,
                "phone_since": None,
                "last_phone_alert": -999999.0,
                "left_seat_since": None,
                "left_seat_alerted": False,
                "is_out_of_seat": False,
                "cumulative_score": 0,
                "penalties": {
                    "looking": 0,
                    "face": 0,
                    "phone": 0,
                    "seat": 0
                }
            }
        return self.contexts[track_id]

    def analyze(self, track: dict, seat_region: Optional[dict] = None, now: Optional[float] = None) -> Tuple[List[dict], int]:
        """
        Evaluates temporal behavior rules on a track.
        Returns: (list of newly triggered events, suspicion_score)
        Where suspicion_score represents the non-decreasing cumulative score,
        while track is also enriched with current_score and cumulative_score.
        """
        if now is None:
            now = time.time()

        track_id = track["track_id"]
        ctx = self._get_context(track_id, now)
        events = []
        global_person_id = track.get("global_person_id")

        # 1. Gaze Direction & Sustained Head Turn
        head_pose = track.get("head_pose", "center")
        current_gaze = head_pose.get("direction", "center") if isinstance(head_pose, dict) else head_pose

        if current_gaze != ctx["gaze"]:
            if current_gaze in ("left", "right"):
                ctx["turn_count"] += 1
                ctx["last_turn_time"] = now
            ctx["gaze"] = current_gaze
            ctx["gaze_started_at"] = now
            ctx["gaze_alerted"] = False
        elif current_gaze in ("left", "right"):
            duration = now - ctx["gaze_started_at"]
            if duration >= self.looking_duration_sec and not ctx["gaze_alerted"]:
                ctx["gaze_alerted"] = True
                penalty = self.weights["repeated_looking"]
                ctx["penalties"]["looking"] = penalty
                evt = {
                    "event_type": "LOOKING_LEFT" if current_gaze == "left" else "LOOKING_RIGHT",
                    "camera_id": track["camera_id"],
                    "track_id": track_id,
                    "student_id": track.get("associated_student_id"),
                    "timestamp": now,
                    "severity": "warning",
                    "score_contribution": penalty,
                    "description": f"Sustained head orientation to {current_gaze} for {duration:.1f}s"
                }
                if global_person_id:
                    evt["global_person_id"] = global_person_id
                events.append(evt)
        else:
            ctx["penalties"]["looking"] = max(0, ctx["penalties"]["looking"] - 1)

        # 2. Face Visibility
        face_visible = track.get("face_visible", True)
        if not face_visible:
            if ctx["face_hidden_since"] is None:
                ctx["face_hidden_since"] = now
            hidden_dur = now - ctx["face_hidden_since"]
            if hidden_dur >= self.face_hidden_duration_sec and not ctx["face_hidden_alerted"]:
                ctx["face_hidden_alerted"] = True
                penalty = self.weights["face_hidden"]
                ctx["penalties"]["face"] = penalty
                evt = {
                    "event_type": "FACE_NOT_VISIBLE",
                    "camera_id": track["camera_id"],
                    "track_id": track_id,
                    "student_id": track.get("associated_student_id"),
                    "timestamp": now,
                    "severity": "warning",
                    "score_contribution": penalty,
                    "description": f"Facial landmarks obstructed from camera view for {hidden_dur:.1f}s"
                }
                if global_person_id:
                    evt["global_person_id"] = global_person_id
                events.append(evt)
        else:
            ctx["face_hidden_since"] = None
            ctx["face_hidden_alerted"] = False
            ctx["penalties"]["face"] = max(0, ctx["penalties"]["face"] - 2)

        # 3. Mobile Device Detection
        phone_detected = track.get("phone_detected", False)
        phone_conf = track.get("phone_confidence", 0.0)
        if phone_detected and phone_conf >= self.phone_confidence_min:
            if ctx["phone_since"] is None:
                ctx["phone_since"] = now
            phone_dur = now - ctx["phone_since"]
            cooldown = (now - ctx["last_phone_alert"]) > 20.0
            if phone_dur >= 1.5 and cooldown:
                ctx["last_phone_alert"] = now
                penalty = self.weights["phone_detected"]
                ctx["penalties"]["phone"] = penalty
                evt = {
                    "event_type": "PHONE_DETECTED",
                    "camera_id": track["camera_id"],
                    "track_id": track_id,
                    "student_id": track.get("associated_student_id"),
                    "timestamp": now,
                    "severity": "high",
                    "score_contribution": penalty,
                    "description": f"Mobile device identified with {phone_conf*100:.0f}% confidence"
                }
                if global_person_id:
                    evt["global_person_id"] = global_person_id
                events.append(evt)
        else:
            ctx["phone_since"] = None
            ctx["penalties"]["phone"] = max(0, ctx["penalties"]["phone"] - 1)

        # Dual score calculation:
        current_score = min(100, max(0, sum(ctx["penalties"].values())))
        # Cumulative score is monotonically non-decreasing
        ctx["cumulative_score"] = min(100, max(ctx.get("cumulative_score", 0), current_score))
        cumulative_score = ctx["cumulative_score"]

        track["current_score"] = current_score
        track["cumulative_score"] = cumulative_score
        track["suspicion_score"] = cumulative_score

        if cumulative_score >= 60 or current_score >= 60:
            track["warning_latched"] = True

        return events, cumulative_score

    def clear_track_warning(self, track_id: str) -> None:
        """
        Admin action: Resets immediate penalties and unlatches warnings.
        Preserves cumulative_score for audit retention.
        """
        if track_id in self.contexts:
            ctx = self.contexts[track_id]
            for k in ctx["penalties"]:
                ctx["penalties"][k] = 0
            ctx["gaze_alerted"] = False
            ctx["face_hidden_alerted"] = False
            ctx["left_seat_alerted"] = False
