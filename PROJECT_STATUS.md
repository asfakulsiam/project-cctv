# Project Status & Feature Checklist

This document details the operational status of every system feature based on codebase inspection and verification testing.

| Feature Category | Feature Description | Status | Verification Details |
| :--- | :--- | :---: | :--- |
| **Camera Ingestion** | RTSP Stream Ingest (`rtsp://`) | **Done** | Formats auth strings, tested via `ffmpeg` child process |
| **Camera Ingestion** | IP Camera Stream Ingest (MJPEG/HTTP) | **Done** | Ingested and tested via `testSourceConnection()` |
| **Camera Ingestion** | Live Stream Link Ingest (HLS `.m3u8` / Direct MP4) | **Done** | Supported and playable in HTML5 video player |
| **Camera Ingestion** | Google Drive Video Share Link Ingest | **Done** | Auto-converted to direct video stream via `resolveSourceUrl()` |
| **Camera Ingestion** | Local Video File Upload | **Done** | Uploads up to 1GB to `/uploads/` via Multer (`POST /api/cameras/upload`) |
| **Camera Ingestion** | Browser Webcam Ingest | **Done** | Acquired via browser `navigator.mediaDevices.getUserMedia` |
| **Stream Testing** | Pipeline Connection Test (`POST /api/cameras/test-source`) | **Done** | Spawns `ffmpeg` to capture 1 frame and returns validation metrics |
| **Vision Detection** | On-Device Browser Detection (TensorFlow.js COCO-SSD) | **Done** | Runs on-device in `src/services/realDetector.ts` (~30 FPS WebGL) |
| **Vision Detection** | Python Microservice Detection (YOLOv8 + ByteTrack) | **Done** | Implemented in `cv_service/main.py` with FastAPI endpoints |
| **Model Automation** | Auto-Download YOLOv8 Weights (Zero-Config) | **Done** | Downloaded via `postinstall` into `cv_service/models/` and `./` |
| **Spatial Tracking** | Centroid Tracking & EMA Box Stabilization | **Done** | Smooth interpolation (`alpha = 0.15`), eliminates box jitter |
| **Spatial Tracking** | Candidate Identifier (P-ID) Assignment | **Done** | Assigns persistent P-IDs (`P-1`, `P-2`) to examinees |
| **Spatial Tracking** | Occlusion Score Archive Recovery | **Done** | Retains P-ID score history during temporary 60s occlusions |
| **Activity Motion** | Velocity-Based Motion Analysis (`observedMotion`) | **Done** | Calculates motion independently of video frame rate |
| **Activity Scoring** | Bounded Cumulative Activity Score (0 – 100) | **Done** | Strictly bounded in `server/db.ts` |
| **Activity Scoring** | Warning Level Categorization | **Done** | *Normal* (0–35), *Warning* (36–70), *High Warning* (71–100) |
| **Live Monitor** | Real-Time Video Player & SVG Overlay Renderer | **Done** | Displays examinee bounding boxes, P-IDs, and toggle controls |
| **Candidate Roster** | Roster List & Metadata Editing | **Done** | Displays examinees with seat numbers, score, and edit controls |
| **Candidate Roster** | Individual Warning Clearing | **Done** | Resets score/warning via `/api/candidates/:id/clear-warning` while preserving activity logs |
| **Audit Logging** | Filterable Activity Audit Log & CSV Export | **Done** | Filters by P-ID, camera, type, or warning; exports to CSV |
| **Audit Logging** | Individual Activity Record Deletion | **Done** | Backed by `DELETE /api/activities/:id` with confirmation UI |
| **Admin Panel** | Protected Dashboard (Environment Credentials) | **Done** | Secure login authenticated via `ADMIN_USERNAME` & `ADMIN_PASSWORD` |
| **Admin Panel** | Activity Weight & Score Threshold Customization | **Done** | Allows admins to adjust point weights and warning limits |
| **Persistence DB** | MongoDB Persistence Layer with Fallback | **Done** | Stores settings, cameras, candidates, logs in MongoDB |
| **Lifecycle Ops** | Single-Command Setup (`npm run setup`) | **Done** | Installs npm, Python requirements, and model weights in 1 step |
| **Lifecycle Ops** | Single-Command Production Start (`npm run prod`) | **Done** | Bundles Vite, builds backend, and serves production app in 1 step |
| **Session Reset** | Exam Session Reset (`POST /api/candidates/clear-all`) | **Done** | Resets candidates and tracking state for new exam sessions |
