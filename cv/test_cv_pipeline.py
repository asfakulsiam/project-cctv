"""
Smart Classroom Exam Monitoring System
Computer Vision & Multi-Camera Unit Test Suite

Verifies:
1. Rule 1 & Rule 2: Human detection gatekeeper (StructuralMorphologyDetector & HumanGate).
   Empty camera or non-human objects result in strictly 0 tracks and 0 events.
2. Camera isolation: independent tracking pools per camera (CAM1-S001, CAM2-S001).
3. 3-Layer Identity Hierarchy:
   - Layer 1: Ephemeral Detection ID
   - Layer 2: Camera-scoped Track ID
   - Layer 3: Cross-camera Global Person ID
4. Student deduplication across multi-camera views with Best View arbitration.
5. Dual scoring & Monotonically non-decreasing cumulative audit scores:
   Admin clearance unlatches warnings and resets current_score without decreasing cumulative_score.
6. Temporal behavior persistence and cooldowns.
7. Stationary persistence: Students sitting still remain continuously tracked.
"""

import unittest
from cv.tracker import PythonCameraTracker, BoundingBox
from cv.behavior_analyzer import PythonBehaviorAnalyzer
from cv.unified_student_model import PythonUnifiedStudentManager
from cv.camera_worker import CameraWorker, HumanGate, StructuralMorphologyDetector

class TestCVPipeline(unittest.TestCase):

    def test_human_gate_and_structural_morphology(self):
        """Rule 1 & Rule 2: Only confirmed human morphology passes the gatekeeper."""
        # Non-human class (e.g. chair or phone) -> Must be rejected
        dets = [
            {"class_name": "chair", "bbox": {"x": 0.2, "y": 0.3, "width": 0.2, "height": 0.4}, "confidence": 0.95},
            {"class_name": "backpack", "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2}, "confidence": 0.90}
        ]
        gated = HumanGate.filter_detections(dets)
        self.assertEqual(len(gated), 0, "Non-human objects must be strictly rejected by HumanGate")

        # Invalid human aspect ratio (e.g. flat horizontal rectangle, aspect ratio < 1.15)
        bad_morphology = [
            {"class_name": "person", "bbox": {"x": 0.1, "y": 0.2, "width": 0.6, "height": 0.1}, "confidence": 0.90}
        ]
        gated_bad = HumanGate.filter_detections(bad_morphology)
        self.assertEqual(len(gated_bad), 0, "Invalid anatomical aspect ratio must be rejected")

        # Valid human seated morphology (aspect ratio ~ 2.0)
        valid_human = [
            {"class_name": "person", "bbox": {"x": 0.2, "y": 0.2, "width": 0.2, "height": 0.45}, "confidence": 0.92}
        ]
        gated_valid = HumanGate.filter_detections(valid_human)
        self.assertEqual(len(gated_valid), 1, "Valid anatomical human detection must pass gatekeeper")
        self.assertTrue(gated_valid[0]["is_confirmed_human"])
        self.assertTrue("detection_id" in gated_valid[0])

    def test_empty_camera_emits_zero_tracks(self):
        """Rule 2: When there is no human in camera, exactly 0 tracks and events are emitted."""
        worker = CameraWorker(
            camera_config={"camera_id": "cam-1", "name": "Exam Cam 1", "enabled": True},
            seats=[],
            students=[]
        )
        result = worker.process_frame([])
        self.assertEqual(len(result["tracks"]), 0)
        self.assertEqual(len(result["events"]), 0)

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

    def test_three_layer_identity_and_student_deduplication(self):
        """3-Layer Identity: Ephemeral det -> Camera track -> Persistent Global Person ID (P-001)."""
        students = [
            {"id": "stu-1", "student_id_number": "STU-001", "name": "Alex Mercer", "seat_id": "seat-1"}
        ]
        seats = [{"id": "seat-1"}]
        manager = PythonUnifiedStudentManager(students, seats)

        # Same student stu-1 observed by Cam 1 and Cam 2 simultaneously
        camera_tracks = {
            "cam-1": [{
                "track_id": "CAM1-S001",
                "associated_student_id": "stu-1",
                "seat_id": "seat-1",
                "bbox": BoundingBox(0.2, 0.3, 0.2, 0.5),
                "face_visible": True,
                "current_score": 10,
                "cumulative_score": 15,
                "suspicion_score": 15
            }],
            "cam-2": [{
                "track_id": "CAM2-S001",
                "associated_student_id": "stu-1",
                "seat_id": "seat-1",
                "bbox": BoundingBox(0.4, 0.3, 0.15, 0.4),
                "face_visible": True,
                "current_score": 8,
                "cumulative_score": 12,
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

        # Global Person Registry verification (Layer 3)
        global_persons = manager.get_global_persons()
        self.assertEqual(len(global_persons), 1)
        gp = global_persons[0]
        self.assertTrue(gp["id"].startswith("P-"))
        self.assertEqual(gp["associated_student_id"], "stu-1")

        # Best View verification: Cam 1 has higher quality and larger bbox
        best_views = [o for o in student["active_observations"] if o["is_best_view"]]
        self.assertEqual(len(best_views), 1)
        self.assertEqual(best_views[0]["camera_id"], "cam-1")

    def test_dual_scoring_and_admin_warning_clearance(self):
        """Rule 6, 7, 8: Dual scores, latched warnings, and admin unlatching with audit preservation."""
        tracker = PythonCameraTracker("cam-1")
        analyzer = PythonBehaviorAnalyzer("test-session")

        # Create track
        det = [{"bbox": BoundingBox(0.3, 0.3, 0.2, 0.45), "confidence": 0.95}]
        tracks = tracker.update(det, now=100.0)
        track = tracks[0]
        tid = track["track_id"]

        # Simulate mobile phone event (penalty 40)
        track["phone_detected"] = True
        track["phone_confidence"] = 0.90
        # First sample
        analyzer.analyze(track, now=100.0)
        # Sample past 1.5s duration threshold -> triggers phone event
        events, cum_score = analyzer.analyze(track, now=102.0)
        self.assertGreaterEqual(cum_score, 40)
        self.assertEqual(track["current_score"], 40)
        self.assertEqual(track["cumulative_score"], 40)

        # Now simulate head turn (penalty 25) to push above warning threshold 60
        track["head_pose"] = "left"
        analyzer.analyze(track, now=102.1)
        events2, cum_score2 = analyzer.analyze(track, now=106.0)
        self.assertGreaterEqual(cum_score2, 60)
        self.assertTrue(track["warning_latched"])

        initial_cumulative = track["cumulative_score"]

        # Proctor clears warning
        tracker.clear_track_warning(tid)
        analyzer.clear_track_warning(tid)

        # Invariant Rule 8: Warning is unlatched, current_score is reset to 0,
        # but cumulative audit score MUST NOT DECREASE!
        self.assertFalse(track["warning_latched"])
        self.assertEqual(track["current_score"], 0)
        self.assertEqual(track["cumulative_score"], initial_cumulative, "Cumulative audit score must be strictly preserved")

    def test_stationary_persistence(self):
        """Rule 4: Stationary human remains actively tracked across ticks."""
        tracker = PythonCameraTracker("cam-1", max_missed=10)

        # Initial detection
        det = [{"bbox": BoundingBox(0.2, 0.2, 0.2, 0.4), "confidence": 0.95}]
        tracks = tracker.update(det, now=10.0)
        self.assertEqual(len(tracks), 1)
        tid = tracks[0]["track_id"]

        # Student sits perfectly motionless: identical bbox across 10 frames
        for f in range(10):
            still_tracks = tracker.update(det, now=10.0 + f * 0.1)
            self.assertEqual(len(still_tracks), 1)
            self.assertEqual(still_tracks[0]["track_id"], tid, "Track ID must remain stable while stationary")
            self.assertEqual(still_tracks[0]["status"], "active")

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
