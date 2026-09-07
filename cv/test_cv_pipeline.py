"""
Smart Classroom Exam Monitoring System
Computer Vision & Multi-Camera Unit Test Suite

Verifies:
1. Camera isolation: independent tracking pools per camera.
2. Track ID generation and prefixes (CAM1-S001, CAM2-S001).
3. Student deduplication across multi-camera views.
4. Temporal behavior persistence and cooldowns.
5. Explainable suspicion score calculation.
Does not require GPU or external network.
"""

import unittest
from cv.tracker import PythonCameraTracker, BoundingBox
from cv.behavior_analyzer import PythonBehaviorAnalyzer
from cv.unified_student_model import PythonUnifiedStudentManager

class TestCVPipeline(unittest.TestCase):

    def test_camera_isolation_and_id_prefixes(self):
        """Camera 1 and Camera 2 must have independent tracking contexts."""
        tracker1 = PythonCameraTracker("cam-1")
        tracker2 = PythonCameraTracker("cam-2")

        det1 = [{"bbox": BoundingBox(0.1, 0.2, 0.2, 0.4), "confidence": 0.95}]
        det2 = [{"bbox": BoundingBox(0.5, 0.2, 0.2, 0.4), "confidence": 0.92}]

        tracks1 = tracker1.update(det1, now=1000.0)
        tracks2 = tracker2.update(det2, now=1000.0)

        self.assertEqual(len(tracks1), 1)
        self.assertEqual(len(tracks2), 1)

        # Scoped prefix check
        self.assertTrue(tracks1[0]["track_id"].startswith("CAM1-S"))
        self.assertTrue(tracks2[0]["track_id"].startswith("CAM2-S"))
        self.assertNotEqual(tracks1[0]["track_id"], tracks2[0]["track_id"])

    def test_unified_student_deduplication(self):
        """When multiple cameras observe the same student, do not create duplicate records."""
        students = [
            {"id": "stu-1", "student_id_number": "STU-001", "name": "Alex Mercer", "seat_id": "seat-1"}
        ]
        seats = [{"id": "seat-1"}]
        manager = PythonUnifiedStudentManager(students, seats)

        # Same student stu-1 detected by Cam 1 and Cam 2 simultaneously
        camera_tracks = {
            "cam-1": [{
                "track_id": "CAM1-S001",
                "associated_student_id": "stu-1",
                "bbox": BoundingBox(0.2, 0.3, 0.2, 0.5),
                "face_visible": True,
                "suspicion_score": 10
            }],
            "cam-2": [{
                "track_id": "CAM2-S001",
                "associated_student_id": "stu-1",
                "bbox": BoundingBox(0.4, 0.3, 0.15, 0.4),
                "face_visible": True,
                "suspicion_score": 12
            }]
        }
        qualities = {"cam-1": 95.0, "cam-2": 85.0}

        unified = manager.sync_observations(camera_tracks, qualities)

        # Must strictly have exactly 1 student record!
        self.assertEqual(len(unified), 1)
        student = unified[0]
        self.assertEqual(student["id"], "stu-1")
        self.assertEqual(student["status"], "present")
        self.assertEqual(len(student["active_observations"]), 2)

        # Cam 1 has higher quality and larger bbox area -> must be flagged as best view
        best_views = [o for o in student["active_observations"] if o["is_best_view"]]
        self.assertEqual(len(best_views), 1)
        self.assertEqual(best_views[0]["camera_id"], "cam-1")

    def test_behavior_temporal_persistence(self):
        """Single frame glance must not trigger an alert; sustained duration must trigger alert."""
        analyzer = PythonBehaviorAnalyzer("test-session")

        track = {
            "camera_id": "cam-1",
            "track_id": "CAM1-S001",
            "associated_student_id": "stu-1",
            "head_pose": "left"
        }

        # Frame 1: Glance starts (t = 0.0s)
        events1, score1 = analyzer.analyze(track, now=0.0)
        self.assertEqual(len(events1), 0, "Single instantaneous frame must not trigger alert")

        # Frame 2: After 2.0s (still under 3.5s threshold)
        events2, score2 = analyzer.analyze(track, now=2.0)
        self.assertEqual(len(events2), 0, "Duration under threshold must not trigger alert")

        # Frame 3: After 4.0s (exceeds 3.5s threshold)
        events3, score3 = analyzer.analyze(track, now=4.0)
        self.assertEqual(len(events3), 1, "Sustained turn must trigger event")
        self.assertEqual(events3[0]["event_type"], "LOOKING_LEFT")
        self.assertGreater(score3, 20, "Suspicion score must incorporate penalty")

    def test_phone_detection_and_cooldown(self):
        """Phone detection must require confidence, persistence, and enforce cooldown."""
        analyzer = PythonBehaviorAnalyzer("test-session")

        track = {
            "camera_id": "cam-1",
            "track_id": "CAM1-S001",
            "associated_student_id": "stu-1",
            "phone_detected": True,
            "phone_confidence": 0.88
        }

        # Initial frame
        events1, _ = analyzer.analyze(track, now=10.0)
        self.assertEqual(len(events1), 0)

        # After 1.6s persistence -> event triggers
        events2, score2 = analyzer.analyze(track, now=11.6)
        self.assertEqual(len(events2), 1)
        self.assertEqual(events2[0]["event_type"], "PHONE_DETECTED")
        self.assertEqual(events2[0]["severity"], "high")

        # Immediately after (t = 12.0s) -> cooldown must suppress duplicate event
        events3, _ = analyzer.analyze(track, now=12.0)
        self.assertEqual(len(events3), 0, "Cooldown must prevent event flooding")


if __name__ == "__main__":
    unittest.main()
