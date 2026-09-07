"""
Smart Classroom Exam Monitoring System
Python Computer Vision Engine - Unified Student Model & Observation Priority

Associates observations across multiple cameras into a single student record.
Never creates duplicate student entities when seen by multiple cameras.
Selects best/nearest camera view (is_best_view) for visual clarity.
"""

from typing import List, Dict, Optional

class PythonUnifiedStudentManager:
    def __init__(self, students: List[dict], seats: List[dict]):
        self.students = {s["id"]: {**s, "active_observations": []} for s in students}
        self.seats = seats

    def sync_observations(self, camera_tracks: Dict[str, List[dict]], camera_qualities: Dict[str, float]) -> List[dict]:
        """
        Synchronizes tracks across all cameras into unified student records.
        """
        # Clear transient observations
        for s in self.students.values():
            s["active_observations"] = []

        for cam_id, tracks in camera_tracks.items():
            base_quality = camera_qualities.get(cam_id, 80.0)
            for track in tracks:
                student_id = track.get("associated_student_id")
                if student_id and student_id in self.students:
                    # Compute quality score based on bbox scale and face visibility
                    bbox = track["bbox"]
                    area = bbox.width * bbox.height
                    face_factor = 30 if track.get("face_visible", True) else 5
                    scale_factor = min(30, max(5, (area / 0.15) * 20))
                    quality = min(100.0, round(base_quality * 0.4 + face_factor + scale_factor, 1))

                    self.students[student_id]["active_observations"].append({
                        "camera_id": cam_id,
                        "track_id": track["track_id"],
                        "quality": quality,
                        "is_best_view": False,
                        "suspicion_score": track.get("suspicion_score", 5)
                    })

        # Determine best view and compute unified suspicion score
        for s in self.students.values():
            obs_list = s["active_observations"]
            if not obs_list:
                s["status"] = "absent"
                s["unified_suspicion_score"] = 0
                continue

            s["status"] = "present"
            best_obs = max(obs_list, key=lambda x: x["quality"])
            best_obs["is_best_view"] = True

            # Quality-weighted cross-camera suspicion score
            total_weight = sum(o["quality"] for o in obs_list)
            if total_weight > 0:
                weighted_sum = sum(o["suspicion_score"] * o["quality"] for o in obs_list)
                s["unified_suspicion_score"] = int(round(weighted_sum / total_weight))
            else:
                s["unified_suspicion_score"] = 5

            if s["unified_suspicion_score"] >= 60:
                s["status"] = "flagged"

        return list(self.students.values())
