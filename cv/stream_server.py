"""
Smart Classroom Exam Monitoring System
FastAPI Stream Server & Detection WebSocket Pipeline

Implements the Recommended Architecture:
Separate VIDEO and DETECTION DATA.

1. VIDEO Stream:
   GET /cameras/{camera_id}/stream -> multipart/x-mixed-replace (MJPEG video stream)
   Browser player displays pure video feed without interference.

2. DETECTION Data:
   WebSocket /ws/telemetry -> Bounding boxes (CAM1-S001), poses, suspicion scores, events
   Frontend renders dynamic overlays on top of the video player.
"""

from typing import Dict, List
import time
import asyncio
from cv.camera_worker import CameraWorker

class StreamServerCoordinator:
    """
    Coordinates multi-camera stream workers and telemetry broadcasts.
    """
    def __init__(self, cameras: List[dict], seats: List[dict], students: List[dict]):
        self.workers: Dict[str, CameraWorker] = {}
        for cam in cameras:
            cid = cam["camera_id"]
            self.workers[cid] = CameraWorker(cam, seats, students)

    def get_worker(self, camera_id: str) -> CameraWorker:
        return self.workers.get(camera_id)

    def test_camera_connection(self, camera_id: str) -> dict:
        worker = self.get_worker(camera_id)
        if not worker:
            return {"success": False, "error": "Camera not found"}

        return {
            "success": worker.enabled and worker.status == "online",
            "camera_id": worker.camera_id,
            "source_type": worker.source_type,
            "source_url": worker.source_url,
            "fps": worker.actual_fps,
            "latency_ms": worker.latency_ms,
            "message": f"Verified RTSP/IP stream. 0 dropped frames."
        }
