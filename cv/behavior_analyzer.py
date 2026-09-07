"""
Smart Classroom Exam Monitoring System
Python Computer Vision Engine - Behavioral Analysis & Suspicion Scoring

Applies temporal thresholds, duration persistence, glance cooldowns,
and generates explainable Suspicion Scores (0 - 100).
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
        """
        if now is None:
            now = time.time()

        ctx = self._get_context(track["track_id"], now)
        events = []

        # 1. Gaze Direction & Sustained Head Turn
        current_gaze = track.get("head_pose", "center")
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
                ctx["penalties"]["looking"] = self.weights["repeated_looking"]
                events.append({
                    "event_type": "LOOKING_LEFT" if current_gaze == "left" else "LOOKING_RIGHT",
                    "camera_id": track["camera_id"],
                    "track_id": track["track_id"],
                    "student_id": track.get("associated_student_id"),
                    "timestamp": now,
                    "severity": "warning",
                    "score_contribution": self.weights["repeated_looking"],
                    "description": f"Sustained head orientation to {current_gaze} for {duration:.1f}s"
                })
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
                ctx["penalties"]["face"] = self.weights["face_hidden"]
                events.append({
                    "event_type": "FACE_NOT_VISIBLE",
                    "camera_id": track["camera_id"],
                    "track_id": track["track_id"],
                    "student_id": track.get("associated_student_id"),
                    "timestamp": now,
                    "severity": "warning",
                    "score_contribution": self.weights["face_hidden"],
                    "description": f"Facial landmarks obstructed from camera view for {hidden_dur:.1f}s"
                })
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
                ctx["penalties"]["phone"] = self.weights["phone_detected"]
                events.append({
                    "event_type": "PHONE_DETECTED",
                    "camera_id": track["camera_id"],
                    "track_id": track["track_id"],
                    "student_id": track.get("associated_student_id"),
                    "timestamp": now,
                    "severity": "high",
                    "score_contribution": self.weights["phone_detected"],
                    "description": f"Mobile device identified with {phone_conf*100:.0f}% confidence"
                })
        else:
            ctx["phone_since"] = None
            ctx["penalties"]["phone"] = max(0, ctx["penalties"]["phone"] - 1)

        # 4. Seat Boundaries
        if seat_region and "bbox" in track:
            bx = track["bbox"].x + track["bbox"].width / 2
            by = track["bbox"].y + track["bbox"].height / 2
            margin = 0.08
            inside = (
                (seat_region["x"] - margin) <= bx <= (seat_region["x"] + seat_region["width"] + margin) and
                (seat_region["y"] - margin) <= by <= (seat_region["y"] + seat_region["height"] + margin)
            )
            if not inside:
                if ctx["left_seat_since"] is None:
                    ctx["left_seat_since"] = now
                left_dur = now - ctx["left_seat_since"]
                if left_dur >= self.leave_seat_grace_sec and not ctx["left_seat_alerted"]:
                    ctx["left_seat_alerted"] = True
                    ctx["is_out_of_seat"] = True
                    ctx["penalties"]["seat"] = self.weights["leaving_seat"]
                    events.append({
                        "event_type": "LEFT_SEAT",
                        "camera_id": track["camera_id"],
                        "track_id": track["track_id"],
                        "student_id": track.get("associated_student_id"),
                        "timestamp": now,
                        "severity": "high",
                        "score_contribution": self.weights["leaving_seat"],
                        "description": f"Student exited designated seating perimeter for {left_dur:.1f}s"
                    })
            else:
                if ctx["is_out_of_seat"]:
                    ctx["is_out_of_seat"] = False
                    ctx["left_seat_alerted"] = False
                    ctx["left_seat_since"] = None
                    ctx["penalties"]["seat"] = 0
                    events.append({
                        "event_type": "RETURNED_TO_SEAT",
                        "camera_id": track["camera_id"],
                        "track_id": track["track_id"],
                        "student_id": track.get("associated_student_id"),
                        "timestamp": now,
                        "severity": "info",
                        "score_contribution": -15,
                        "description": "Student returned to designated workstation"
                    })
                else:
                    ctx["left_seat_since"] = None

        raw_score = sum(ctx["penalties"].values())
        suspicion_score = min(100, max(5, raw_score))
        return events, suspicion_score
