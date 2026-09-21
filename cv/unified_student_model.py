"""
Smart Classroom Exam Monitoring System
Python Computer Vision Engine - Unified Student Model & Global Person Registry (Layer 3)

ARCHITECTURAL INVARIANTS:
1. Three-Layer Identity Architecture:
   - Layer 1: Ephemeral per-frame Detection ID (e.g. det_104)
   - Layer 2: Camera-scoped Track ID (e.g. CAM1-S001, CAM2-S001)
   - Layer 3: Cross-camera Persistent Global Person ID (e.g. P-001) linked to formal StudentRecord
2. Cross-Camera Deduplication:
   When multiple cameras view the same subject/seat, tracks are synthesized into ONE
   GlobalPerson and ONE unified StudentRecord.
3. Observation Quality Priority:
   Dynamically evaluates clarity and flags clearest view (is_best_view = True).
4. Dual Scores:
   Maintains current_score (immediate risk) and monotonically non-decreasing cumulative_score.
5. Admin Clearance:
   clear_student_warning unlatches warning and resets immediate risk without altering cumulative score.
"""

from typing import List, Dict, Optional, Tuple
import math
import time

class PythonUnifiedStudentManager:
    def __init__(self, students: List[dict], seats: List[dict]):
        self.students: Dict[str, dict] = {
            s["id"]: {
                **s, 
                "active_observations": [],
                "current_score": 0,
                "cumulative_score": 0,
                "unified_suspicion_score": 0
            } 
            for s in students
        }
        self.seats = seats
        self.global_persons: Dict[str, dict] = {}  # gp_id -> GlobalPerson dict
        self.next_gp_num = 1

    def _generate_gp_id(self) -> str:
        gid = f"P-{self.next_gp_num:03d}"
        self.next_gp_num += 1
        return gid

    def sync_observations(
        self, 
        camera_tracks: Dict[str, List[dict]], 
        camera_qualities: Dict[str, float],
        now: Optional[float] = None
    ) -> List[dict]:
        """
        Synchronizes tracks across all cameras into unified student records and global persons.
        """
        if now is None:
            now = time.time()

        # Clear transient observations
        for s in self.students.values():
            s["active_observations"] = []

        active_gp_links: Dict[str, list] = {}

        for cam_id, tracks in camera_tracks.items():
            base_quality = camera_qualities.get(cam_id, 80.0)
            for track in tracks:
                student_id = track.get("associated_student_id")
                seat_id = track.get("seat_id")

                # Compute observation quality score
                bbox = track["bbox"]
                bw = bbox.width if hasattr(bbox, "width") else bbox["width"]
                bh = bbox.height if hasattr(bbox, "height") else bbox["height"]
                area = bw * bh
                face_factor = 30 if track.get("face_visible", True) else 5
                scale_factor = min(30, max(5, (area / 0.15) * 20))
                quality = min(100.0, round(base_quality * 0.4 + face_factor + scale_factor, 1))

                # Layer 3: Associate Global Person ID
                gp_id = track.get("global_person_id")
                if not gp_id:
                    # Match by student or seat
                    if student_id:
                        for gid, gp in self.global_persons.items():
                            if gp.get("associated_student_id") == student_id:
                                gp_id = gid
                                break
                    elif seat_id:
                        for gid, gp in self.global_persons.items():
                            if gp.get("seat_id") == seat_id:
                                gp_id = gid
                                break

                if not gp_id:
                    gp_id = self._generate_gp_id()
                    student_rec = self.students.get(student_id) if student_id else None
                    self.global_persons[gp_id] = {
                        "id": gp_id,
                        "associated_student_id": student_id,
                        "associated_student_name": student_rec.get("name") if student_rec else None,
                        "seat_id": seat_id,
                        "camera_tracks": [],
                        "current_score": track.get("current_score", 0),
                        "cumulative_score": track.get("cumulative_score", 0),
                        "warning_latched": track.get("warning_latched", False),
                        "last_seen": now,
                        "status": "in_seat" if seat_id else "unassigned"
                    }

                track["global_person_id"] = gp_id

                # Record GP link
                if gp_id not in active_gp_links:
                    active_gp_links[gp_id] = []
                active_gp_links[gp_id].append({
                    "camera_id": cam_id,
                    "track_id": track["track_id"],
                    "quality": quality,
                    "is_best_view": False,
                    "track": track
                })

                # Attach observation to formal student if associated
                if student_id and student_id in self.students:
                    self.students[student_id]["active_observations"].append({
                        "camera_id": cam_id,
                        "track_id": track["track_id"],
                        "global_person_id": gp_id,
                        "quality": quality,
                        "is_best_view": False,
                        "current_score": track.get("current_score", 0),
                        "cumulative_score": track.get("cumulative_score", track.get("suspicion_score", 0)),
                        "suspicion_score": track.get("suspicion_score", 0)
                    })

        # Update Global Persons state and best views
        for gp_id, links in active_gp_links.items():
            gp = self.global_persons.get(gp_id)
            if not gp:
                continue
            best_link = max(links, key=lambda x: x["quality"])
            best_link["is_best_view"] = True
            gp["camera_tracks"] = [
                {
                    "camera_id": l["camera_id"],
                    "track_id": l["track_id"],
                    "quality": l["quality"],
                    "is_best_view": l["is_best_view"]
                }
                for l in links
            ]
            gp["last_seen"] = now
            max_current = max(l["track"].get("current_score", 0) for l in links)
            max_cumulative = max(l["track"].get("cumulative_score", l["track"].get("suspicion_score", 0)) for l in links)
            gp["current_score"] = max_current
            gp["cumulative_score"] = max(gp.get("cumulative_score", 0), max_cumulative)
            if gp["cumulative_score"] >= 60 or gp["current_score"] >= 60:
                gp["warning_latched"] = True

        # Determine best view and compute unified suspicion scores for students
        for s in self.students.values():
            obs_list = s["active_observations"]
            if not obs_list:
                s["status"] = "absent"
                s["current_score"] = 0
                # Preserve cumulative score
                continue

            s["status"] = "present"
            best_obs = max(obs_list, key=lambda x: x["quality"])
            best_obs["is_best_view"] = True

            # Quality-weighted cross-camera suspicion score
            total_weight = sum(o["quality"] for o in obs_list)
            if total_weight > 0:
                weighted_cum = sum(o["cumulative_score"] * o["quality"] for o in obs_list)
                weighted_cur = sum(o["current_score"] * o["quality"] for o in obs_list)
                agg_cum = int(round(weighted_cum / total_weight))
                agg_cur = int(round(weighted_cur / total_weight))
                s["cumulative_score"] = max(s.get("cumulative_score", 0), agg_cum)
                s["current_score"] = agg_cur
                s["unified_suspicion_score"] = s["cumulative_score"]
            else:
                s["unified_suspicion_score"] = s.get("cumulative_score", 0)

            if s["unified_suspicion_score"] >= 60 or s.get("current_score", 0) >= 60:
                s["status"] = "flagged"

        return list(self.students.values())

    def clear_student_warning(self, student_id: str) -> None:
        """
        Admin clearance: Resets immediate current_score to 0, sets status to 'present',
        and unlatches warning on global person, while preserving cumulative audit score.
        """
        if student_id in self.students:
            s = self.students[student_id]
            s["current_score"] = 0
            if s["status"] == "flagged":
                s["status"] = "present"

        for gp in self.global_persons.values():
            if gp.get("associated_student_id") == student_id:
                gp["warning_latched"] = False
                gp["current_score"] = 0

    def get_global_persons(self) -> List[dict]:
        return list(self.global_persons.values())
