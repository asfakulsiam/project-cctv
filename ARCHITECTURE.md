# System Architecture: Exam Hall Monitoring Assistant

## 1. End-to-End Data Flow Pipeline

```text
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                           1. VIDEO SOURCES                              │
  │   RTSP Stream / IP Camera / Google Drive Link / Video File / Webcam     │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                 2. STREAM RESOLVER & INGESTION MODULE                   │
  │   - server/ingestion.ts (ffmpeg spawn probing & frame extraction)       │
  │   - src/utils/sourceResolver.ts (Google Drive & auth URL formatting)    │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                 3. COMPUTER VISION DETECTION ENGINE                     │
  │   - On-Device: TensorFlow.js COCO-SSD (src/services/realDetector.ts)   │
  │   - Microservice Worker (Opt.): Python YOLOv8 (cv_service/main.py)      │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                4. SPATIAL CENTROID & BYTETRACK TRACKER                  │
  │   - Bounding Box EMA Smoothing (alpha = 0.15)                           │
  │   - Persistent Candidate Identifier (P-ID) Assignment                   │
  │   - 60-second Score Archive (scoreArchive) for Occlusion Recovery       │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │             5. MOTION SCORING & STATE PERSISTENCE ENGINE                │
  │   - server/db.ts (MongoDB Collections / local JSON fallback)           │
  │   - Bounded Cumulative Score (0 – 100)                                  │
  │   - Warning Level Categorization (Normal / Warning / High Warning)      │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    6. EXPRESS REST API SERVER                           │
  │   - server/routes.ts (Camera CRUD, Candidates, Activities, Admin Auth) │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    7. REACT FRONTEND APPLICATION                        │
  │   - Live Monitor (MainPlayer.tsx) with SVG Overlays & Highlight Cards  │
  │   - Candidate Roster & Warning Clearing (CandidateList.tsx)             │
  │   - Filterable Audit Log & CSV Exporter (ActivityPanel.tsx)             │
  │   - Protected Admin Panel (AdminPanel.tsx)                              │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technical Design Rationale

### A. Why `ffmpeg` for Stream Ingestion?
Standard web browsers cannot natively demux RTSP network camera streams (`rtsp://`) or raw MJPEG streams. Spawning `ffmpeg` child processes on the server allows the system to interface directly with industrial IP cameras, execute frame extractions, probe stream connectivity (`POST /api/cameras/test-source`), and serve clean frame data to the frontend or vision pipeline.

### B. Why Dual Vision Engine Support (Browser JS & Python Worker)?
- **Browser On-Device Vision Engine (`src/services/realDetector.ts`)**: Runs TensorFlow.js COCO-SSD directly in the browser via WebGL acceleration. This eliminates zero-network external server dependencies, ensuring the app runs out-of-the-box on any computer with Node.js.
- **Python Microservice Worker (`cv_service/main.py`)**: Provides server-side GPU/CPU accelerated YOLOv8 object detection combined with ByteTrack multi-object tracking. When a Python environment is present, `server.ts` automatically spawns the microservice.

### C. Why Server-Side Persistence & Capped Scoring?
If scoring logic were computed strictly inside browser state, refreshing the page or closing a browser tab would lose examinee tracking history and reset warning levels. Persisting examinee state and activity logs in MongoDB via `server/db.ts` (with automatic fallback to `/data/exam_monitoring.json`) ensures state consistency across multiple proctor terminals. Score bounding (strictly capped between `0` and `100`) prevents runaway score inflation.

---

## 3. Complete REST API Endpoint Reference

All endpoints are mounted under `/api` in `server/routes.ts`:

### Diagnostics & Health
- `GET /api/health` — Returns system status, server health, and diagnostic metrics (FPS, active tracks, warnings).
- `GET /api/cv/health` — Returns computer vision engine health.
- `GET /api/diagnostics` — Returns performance metrics (latency, processed frames count).

### Computer Vision Frame Pipeline
- `POST /api/cv/sync-detections` — Syncs real-time client detections and recorded activity events with the server database.
- `POST /api/cv/process-frame` — Processes base64 frame images on the server.
- `POST /api/cv/reset-tracks` — Resets active tracking state for a specific camera or all cameras.

### Camera Ingestion & Stream Testing
- `POST /api/cameras/test-source` — Tests stream connectivity by executing a 1-frame extraction via `ffmpeg`.
- `POST /api/cameras/upload` — Handles video file uploads (up to 1GB) via Multer and saves them to `/uploads/`.
- `GET /api/cameras/resolve-url` — Resolves Google Drive share links or credentialed RTSP URLs into direct playable streams.

### Camera Management (CRUD)
- `GET /api/cameras` — Returns list of all configured cameras.
- `GET /api/cameras/:id` — Returns details for a specific camera.
- `POST /api/cameras` — Creates a new camera configuration.
- `PUT /api/cameras/:id` — Updates an existing camera configuration.
- `DELETE /api/cameras/:id` — Deletes a camera configuration.

### Candidate Roster & Warning Management
- `GET /api/candidates` — Returns all tracked candidates (supports `?activeOnly=true`).
- `GET /api/candidates/:id` — Returns details for a specific candidate.
- `PUT /api/candidates/:id` — Updates candidate metadata (student name, seat number, notes).
- `POST /api/candidates/:id/clear-warning` — Clears warning badge for an examinee and resets score to 0 while preserving activity log history.
- `DELETE /api/candidates/:id` — Removes an individual candidate from the roster.
- `DELETE /api/candidates` — Clears all candidate roster entries.
- `POST /api/candidates/clear-all` / `POST /api/candidates/reset-session` — Resets session tracking data for a new examination.

### Activity Audit Logs
- `GET /api/activities` — Returns recorded activity logs (supports filtering by `pId`, `activityType`, `warningLevel`, `cameraId`, `limit`).
- `POST /api/activities` — Records a new activity event.
- `DELETE /api/activities/:id` — Deletes an individual activity log record.
- `POST /api/activities/clear` / `DELETE /api/activities` — Clears all activity log history.

### Activity Type Configuration & Score Thresholds
- `GET /api/activity-types` — Returns configured activity rules and point weights.
- `POST /api/activity-types` — Creates a new activity rule.
- `PUT /api/activity-types/:id` / `PATCH /api/activity-types/:id` — Updates an activity rule's point weight or severity.
- `DELETE /api/activity-types/:id` — Deletes an activity rule.
- `GET /api/scores/config` / `GET /api/settings/thresholds` — Returns score thresholds (*Normal*, *Warning*, *High Warning*).
- `PUT /api/scores/config` / `PUT /api/settings/thresholds` — Updates score threshold limits.

### Application Settings & Admin Auth
- `GET /api/settings` — Returns global application settings (e.g. app name).
- `PUT /api/settings` — Updates application settings.
- `POST /api/auth/login` — Authenticates admin access via environment variables `ADMIN_USERNAME` & `ADMIN_PASSWORD` (timing-safe comparison).
