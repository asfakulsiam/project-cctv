"""
Smart Classroom Exam Monitoring System
Python Multi-Camera Runner & Real-Time Computer Vision Processor

Demonstrates independent multi-camera ingestion, ByteTrack-style object tracking,
temporal behavioral analysis, and unified student observation association.
"""

import time
import json
from typing import Dict, List
from cv.tracker import PythonCameraTracker, BoundingBox
from cv.behavior_analyzer import PythonBehaviorAnalyzer
from cv.unified_student_model import PythonUnifiedStudentManager

class MultiCameraCVRunner:
    """
    Coordinates multi-camera CV processing pipeline.
    """
    def __init__(self, camera_ids: List[str], students: List[dict], seats: List[dict]):
        self.camera_ids = camera_ids
        self.trackers: Dict[str, PythonCameraTracker] = {
            cid: PythonCameraTracker(cid) for cid in camera_ids
        }
        self.analyzer = PythonBehaviorAnalyzer(session_id="exam-session")
        self.unified_manager = PythonUnifiedStudentManager(students, seats)
        self.qualities = {cid: 90.0 - (i * 5) for i, cid in enumerate(camera_ids)}

    def process_frame_cycle(self, raw_detections_by_camera: Dict[str, List[dict]]) -> dict:
        """
        Executes a single synchronized frame processing step across all cameras.
        """
        now = time.time()
        camera_tracks = {}
        all_events = []

        # 1. Independent per-camera tracking & temporal behavior
        for cid in self.camera_ids:
            tracker = self.trackers[cid]
            raw_dets = raw_detections_by_camera.get(cid, [])
            tracks = tracker.update(raw_dets, now=now)

            # Analyze behaviors for each active track
            for t in tracks:
                events, score = self.analyzer.analyze(t, now=now)
                t["suspicion_score"] = score
                all_events.extend(events)

            camera_tracks[cid] = tracks

        # 2. Unified student cross-camera association
        unified_students = self.unified_manager.sync_observations(camera_tracks, self.qualities)

        return {
            "timestamp": now,
            "camera_tracks": camera_tracks,
            "unified_students": unified_students,
            "events": all_events
        }

if __name__ == "__main__":
    print("[Python CV Runner] Initializing CV pipeline runner...")
    runner = MultiCameraCVRunner([], [], [])
    result = runner.process_frame_cycle({})
    print(f"[Python CV Runner] Initialized with 0 cameras. Ready for live stream ingestion.")
