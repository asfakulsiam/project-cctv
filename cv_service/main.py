"""
cv_service/main.py - Python FastAPI Computer Vision Microservice Worker
Runs YOLOv8 person detection with ByteTrack multi-object spatial tracking and temporal motion analysis.
Exposes /track, /track-b64, /health, and /reset-tracks endpoints over FastAPI / Uvicorn.
"""
import os
import time
import base64
import logging
from typing import List, Dict, Any, Optional, Tuple
from collections import deque

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configuration via environment variable with automatic multi-path discovery
def resolve_model_path() -> str:
    env_path = os.environ.get("CV_MODEL_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    
    # Auto-detect standard locations so no manual path configuration is needed
    search_paths = [
        "yolov8n.pt",
        "cv_service/models/yolov8n.pt",
        "models/yolov8n.pt",
        os.path.join(os.path.dirname(__file__), "models", "yolov8n.pt"),
        os.path.join(os.path.dirname(__file__), "..", "yolov8n.pt"),
    ]
    for p in search_paths:
        if os.path.exists(p):
            return p
    return env_path or "yolov8n.pt"

MODEL_PATH = resolve_model_path()
CONFIDENCE_THRESHOLD = float(os.environ.get("CV_CONF_THRESHOLD", "0.30"))
TRACK_TTL_S = 5.0

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cv_worker")

app = FastAPI(title="Exam Monitoring CV Worker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-loaded model to ensure clean startup
_model = None

def get_model():
    global _model
    if _model is None:
        logger.info(f"Loading YOLO model from: {MODEL_PATH}")
        try:
            from ultralytics import YOLO
            _model = YOLO(MODEL_PATH)
            logger.info("YOLO model loaded successfully with ByteTrack support.")
        except Exception as e:
            logger.error(f"Error loading YOLO model: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to load YOLO model: {str(e)}")
    return _model

# Temporal tracking state per camera for observable activity detection
class TrackHistory:
    def __init__(self, tracker_id: int):
        self.tracker_id = tracker_id
        # Store recent frames data: (timestamp, [x1, y1, x2, y2], center_x, center_y)
        self.history = deque(maxlen=30)
        self.baseline_center: Optional[Tuple[float, float]] = None
        self.last_activity_time = 0.0
        self.last_seen: float = 0.0
        self.total_movement_score = 0.0
        self.smoothed_cx: Optional[float] = None
        self.smoothed_cy: Optional[float] = None
        self.fixed_width: Optional[float] = None
        self.fixed_height: Optional[float] = None

track_histories: Dict[str, TrackHistory] = {}

class TrackRequest(BaseModel):
    image_base64: Optional[str] = None
    camera_id: str = "cam-1"
    timestamp: Optional[float] = None
    conf: Optional[float] = None

class DetectionItem(BaseModel):
    tracker_id: int
    confidence: float
    bbox: List[float] # [x1, y1, x2, y2] normalized 0..1
    pixel_bbox: List[int] # [px1, py1, px2, py2]
    center: List[float] # [cx, cy] normalized
    observed_motion: float # 0.0 to 1.0 relative motion score
    detected_activities: List[str] # observable events
    is_stationary: bool

class TrackResponse(BaseModel):
    camera_id: str
    timestamp: float
    frame_width: int
    frame_height: int
    detection_count: int
    active_track_count: int
    latency_ms: float
    model_name: str
    detections: List[DetectionItem]

@app.get("/health")
def health_check():
    loaded = _model is not None
    return {
        "status": "ok",
        "service": "cv_worker",
        "model_path": MODEL_PATH,
        "model_loaded": loaded,
        "tracker": "bytetrack",
        "device": "cpu"
    }

@app.post("/reset-tracks")
def reset_tracks(camera_id: Optional[str] = None):
    global track_histories
    if camera_id:
        keys_to_del = [k for k in list(track_histories.keys()) if k.startswith(f"{camera_id}_")]
        for k in keys_to_del:
            del track_histories[k]
    else:
        track_histories.clear()
    return {"status": "ok", "message": f"Track history reset for camera {camera_id or 'all'}"}

def prune_tracks(now: float) -> None:
    dead = [k for k, v in track_histories.items() if now - v.last_seen > TRACK_TTL_S]
    for k in dead:
        del track_histories[k]

def compute_box_iou(boxA: List[float], boxB: List[float]) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interWidth = max(0.0, xB - xA)
    interHeight = max(0.0, yB - yA)
    interArea = interWidth * interHeight

    areaA = max(0.0, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    areaB = max(0.0, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))
    unionArea = areaA + areaB - interArea

    if unionArea <= 0:
        return 0.0
    return interArea / unionArea

# Fix 6: Suppress duplicate boxes without merging adjacent students
def suppress_duplicates(boxes: List[Dict[str, Any]], iou_thresh: float = 0.65) -> List[Dict[str, Any]]:
    boxes = sorted(boxes, key=lambda b: b["conf"], reverse=True)
    kept: List[Dict[str, Any]] = []
    for b in boxes:
        if all(compute_box_iou(b["bbox"], k["bbox"]) < iou_thresh for k in kept):
            kept.append(b)
    return kept

def analyze_temporal_activity(
    camera_id: str,
    tracker_id: int,
    bbox_norm: List[float],
    timestamp: float
) -> Tuple[float, List[str], bool, List[float], List[float]]:
    key = f"{camera_id}_{tracker_id}"
    if key not in track_histories:
        track_histories[key] = TrackHistory(tracker_id)
    
    history_obj = track_histories[key]

    raw_x1, raw_y1, raw_x2, raw_y2 = bbox_norm
    target_cx = (raw_x1 + raw_x2) / 2.0
    target_cy = (raw_y1 + raw_y2) / 2.0
    raw_w = max(0.04, raw_x2 - raw_x1)
    raw_h = max(0.08, raw_y2 - raw_y1)

    if history_obj.fixed_width is None:
        history_obj.fixed_width = raw_w
        history_obj.fixed_height = raw_h
        history_obj.smoothed_cx = target_cx
        history_obj.smoothed_cy = target_cy
        history_obj.baseline_center = (target_cx, target_cy)
        history_obj.last_seen = timestamp
    else:
        alpha = 0.15
        max_speed = 0.012
        diff_x = target_cx - history_obj.smoothed_cx
        diff_y = target_cy - history_obj.smoothed_cy
        step_dist = np.hypot(diff_x, diff_y)

        applied_dx = diff_x * alpha
        applied_dy = diff_y * alpha
        if step_dist > max_speed:
            scale = max_speed / step_dist
            applied_dx = diff_x * scale
            applied_dy = diff_y * scale

        history_obj.smoothed_cx += applied_dx
        history_obj.smoothed_cy += applied_dy

        # Update dimensions with slow EMA
        history_obj.fixed_width = history_obj.fixed_width * 0.92 + raw_w * 0.08
        history_obj.fixed_height = history_obj.fixed_height * 0.92 + raw_h * 0.08

    half_w = history_obj.fixed_width / 2.0
    half_h = history_obj.fixed_height / 2.0
    smooth_bbox = [
        round(max(0.005, min(0.95, history_obj.smoothed_cx - half_w)), 4),
        round(max(0.005, min(0.95, history_obj.smoothed_cy - half_h)), 4),
        round(max(0.05, min(0.995, history_obj.smoothed_cx + half_w)), 4),
        round(max(0.08, min(0.995, history_obj.smoothed_cy + half_h)), 4),
    ]

    current_data = (timestamp, smooth_bbox, history_obj.smoothed_cx, history_obj.smoothed_cy)
    history_obj.history.append(current_data)

    detected_activities = []
    observed_motion = 0.0
    is_stationary = True

    # Fix 8: Velocity-based motion independent of frame rate
    dt = max(1e-3, timestamp - history_obj.last_seen)
    history_obj.last_seen = timestamp

    if len(history_obj.history) >= 2:
        prev_cx, prev_cy = history_obj.history[-2][2], history_obj.history[-2][3]
        disp = float(np.hypot(history_obj.smoothed_cx - prev_cx, history_obj.smoothed_cy - prev_cy))
        velocity = disp / dt
        observed_motion = min(1.0, velocity / 0.25)
        if observed_motion >= 0.10:
            is_stationary = False

        if len(history_obj.history) >= 5:
            recent = list(history_obj.history)[-5:]
            recent_disp = np.hypot(recent[-1][2] - recent[0][2], recent[-1][3] - recent[0][3])
            cooldown_ok = (timestamp - history_obj.last_activity_time) > 2.0

            if recent_disp > 0.04 and cooldown_ok:
                detected_activities.append("Sustained rapid motion")
                history_obj.last_activity_time = timestamp
            elif recent_disp > 0.02 and cooldown_ok:
                detected_activities.append("Sudden large displacement")
                history_obj.last_activity_time = timestamp

    center = [round(history_obj.smoothed_cx, 4), round(history_obj.smoothed_cy, 4)]
    return round(observed_motion, 3), detected_activities, is_stationary, smooth_bbox, center

# Fix 18: Core pipeline function
def _run_pipeline(camera_id: str, ts: float, conf_thresh: float, img: np.ndarray) -> TrackResponse:
    start_time = time.time()
    prune_tracks(ts) # Fix 17: TTL prune

    height, width = img.shape[:2]
    model = get_model()

    # Run YOLO with ByteTrack
    results = model.track(
        source=img,
        classes=[0],
        tracker="bytetrack.yaml",
        persist=True,
        conf=conf_thresh,
        verbose=False
    )

    raw_detected_boxes: List[Dict[str, Any]] = []

    if len(results) > 0 and results[0].boxes is not None:
        boxes = results[0].boxes
        for box in boxes:
            # Fix 7: Skip unconfirmed boxes
            if box.id is None:
                continue

            cls_id = int(box.cls[0].item()) if box.cls is not None else 0
            if cls_id != 0:
                continue

            confidence = float(box.conf[0].item()) if box.conf is not None else 0.0
            tracker_id = int(box.id[0].item())

            xyxy = box.xyxy[0].cpu().numpy().tolist()
            px1, py1, px2, py2 = int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])

            norm_x1 = max(0.0, min(1.0, px1 / width))
            norm_y1 = max(0.0, min(1.0, py1 / height))
            norm_x2 = max(0.0, min(1.0, px2 / width))
            norm_y2 = max(0.0, min(1.0, py2 / height))

            w = norm_x2 - norm_x1
            h = norm_y2 - norm_y1
            if w < 0.03 or h < 0.06:
                continue

            # Fix 5: Loosen aspect ratio filter
            aspect = h / max(0.001, w)
            if aspect < 0.30 or aspect > 5.0:
                continue

            raw_detected_boxes.append({
                "cls_id": 0,
                "class_name": "person",
                "tracker_id": tracker_id,
                "conf": confidence,
                "bbox": [norm_x1, norm_y1, norm_x2, norm_y2]
            })

    # Fix 6: Suppress duplicate boxes
    consolidated = suppress_duplicates(raw_detected_boxes)

    detections: List[DetectionItem] = []
    active_tracker_ids = set()

    for item in consolidated:
        t_id = item["tracker_id"]
        active_tracker_ids.add(t_id)

        observed_motion, detected_activities, is_stationary, smooth_bbox, center = analyze_temporal_activity(
            camera_id, t_id, item["bbox"], ts
        )

        px1 = int(round(smooth_bbox[0] * width))
        py1 = int(round(smooth_bbox[1] * height))
        px2 = int(round(smooth_bbox[2] * width))
        py2 = int(round(smooth_bbox[3] * height))

        detections.append(DetectionItem(
            tracker_id=t_id,
            confidence=item["conf"],
            bbox=smooth_bbox,
            pixel_bbox=[px1, py1, px2, py2],
            center=center,
            observed_motion=observed_motion,
            detected_activities=detected_activities,
            is_stationary=is_stationary
        ))

    latency = (time.time() - start_time) * 1000.0

    return TrackResponse(
        camera_id=camera_id,
        timestamp=ts,
        frame_width=width,
        frame_height=height,
        detection_count=len(detections),
        active_track_count=len(active_tracker_ids),
        latency_ms=round(latency, 2),
        model_name=MODEL_PATH,
        detections=detections
    )

# Fix 18: Multipart and Base64 split endpoints
@app.post("/track", response_model=TrackResponse)
async def track_frame_multipart(
    camera_id: str = Form("cam-1"),
    timestamp: Optional[float] = Form(None),
    conf: Optional[float] = Form(None),
    file: UploadFile = File(...),
):
    content = await file.read()
    img = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Undecodable frame")
    return _run_pipeline(camera_id, timestamp or time.time(), conf or CONFIDENCE_THRESHOLD, img)

@app.post("/track-b64", response_model=TrackResponse)
async def track_frame_b64(payload: TrackRequest):
    if not payload.image_base64:
        raise HTTPException(400, "image_base64 required")
    b64 = payload.image_base64.split(",", 1)[-1]
    img = cv2.imdecode(np.frombuffer(base64.b64decode(b64), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Undecodable frame")
    return _run_pipeline(
        payload.camera_id,
        payload.timestamp or time.time(),
        payload.conf or CONFIDENCE_THRESHOLD,
        img,
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
