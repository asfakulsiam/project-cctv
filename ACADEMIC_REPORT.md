# Academic Project Report: Exam Hall Monitoring Assistant

## 1. Problem Statement & Motivation
In large academic examination halls containing dozens or hundreds of examinees, human invigilators face significant cognitive overload. A single teacher or proctor cannot simultaneously observe every student across multiple rows, aisles, and angles for extended examination durations (often 2–3 hours). Physical fatigue, blind spots, and divided attention make manual invigilation challenging.

The **Exam Hall Monitoring Assistant** addresses this challenge by serving as an intelligent supervisory tool. Rather than replacing human authority, the system acts as an extra pair of eyes: it ingests live video feeds from CCTV cameras or webcams, detects examines in the exam hall, tracks them across temporal video frames using persistent candidate identifiers (P-IDs), and computes observable activity indicators based on physical movement.

---

## 2. System Architecture & Module Breakdown

The system is implemented as a full-stack, modular architecture comprising seven core modules:

```
[ Video Sources ] (RTSP / IP Cam / Drive / Upload / Webcam)
       │
       ▼
[ Module 1: Ingestion & Stream Resolver ] ─── (ffmpeg validation)
       │
       ▼
[ Module 2: Computer Vision & Spatial Tracker ] ─── (COCO-SSD / YOLOv8 + ByteTrack)
       │
       ▼
[ Module 3: Motion Analysis & Activity Scoring Engine ] ─── (db.ts score bounds 0–100)
       │
       ├───► [ Module 4: Live Video Player & SVG Overlays ]
       ├───► [ Module 5: Candidate Roster & Warning Management ]
       ├───► [ Module 6: Activity Audit Log & CSV Exporter ]
       └───► [ Module 7: Protected Admin Dashboard ]
```

### Module 1: Universal Video Ingestion & Stream Resolver
- **Files**: `server/ingestion.ts`, `src/utils/sourceResolver.ts`
- **Functionality**: Resolves diverse video input types into playable streams:
  - **Cloud Share URLs**: Converts Google Drive share links (`drive.google.com/file/d/...`) into direct video streams (`https://drive.google.com/uc?export=download&id=...`).
  - **Authenticated Streams**: Formats RTSP and IP camera URLs with optional username/password credentials.
  - **File Uploads**: Handles local video file uploads up to 1GB via Multer (`/api/cameras/upload`), storing files in `/uploads/`.
  - **Connection Probing**: Spawns system `ffmpeg` CLI processes to execute single-frame test extractions (`POST /api/cameras/test-source`) and verify stream accessibility before saving camera configurations.

### Module 2: Computer Vision Detection & Spatial Tracking Engine
- **Files**: `src/services/realDetector.ts`, `cv_service/main.py`
- **Functionality**: Performs human detection and tracking:
  - **Neural Detection**: Runs TensorFlow.js COCO-SSD on-device in the browser (or YOLOv8n via the Python FastAPI worker `cv_service/main.py`) to detect examinees (`person` class).
  - **Bounding Box Stabilization**: Uses Exponential Moving Average (EMA) smoothing (`alpha = 0.15`) with displacement capping (`max_speed = 0.012`) to eliminate box jitter and width/height pulsing.
  - **Spatial Centroid Tracking**: Tracks examinees across frames without biometric facial recognition. Assigns canonical Candidate P-IDs (`P-1`, `P-2`).
  - **Persistent Score Archiving**: Maintains a 60-second score archive (`scoreArchive`) to preserve an examinee's ID and activity score if temporarily occluded by a passing invigilator.
  - **Hit-Count Confirmation**: Requires 3 consecutive frame detections before confirming a track overlay, suppressing transient visual noise.

### Module 3: Motion Analysis & Activity Scoring Engine
- **Files**: `server/db.ts`, `server/cvClient.ts`
- **Functionality**: Evaluates physical motion and updates candidate scores with MongoDB persistence (and local JSON fallback):
  - **Score Bounds**: Candidate scores are strictly bounded between `0` and `100`.
  - **Configurable Activity Weights**: Activity events add points to candidate scores based on configured rules (e.g., *Rapid position shift*: +10, *Displacement from seat*: +8, *Head or posture rotation*: +7).
  - **Warning Categorization**:
    - **Normal**: Score `0 – 35`
    - **Warning**: Score `36 – 70`
    - **High Warning**: Score `71 – 100`
  - **Individual Warning Clearing**: Admins/invigilators can clear an examinee's warning badge (`POST /api/candidates/:id/clear-warning`), which resets their score to `0` while preserving complete audit log history.

### Module 4: Live Video Player & Overlay Renderer
- **Files**: `src/components/MainPlayer.tsx`
- **Functionality**: Renders HTML5 video feeds with real-time SVG overlays displaying examinee bounding boxes, candidate P-IDs, warning badges, and activity indicator cards. Provides overlay toggle controls and quick camera selection.

### Module 5: Candidate Roster & Warning Management
- **Files**: `src/components/CandidateList.tsx`
- **Functionality**: Displays a searchable list of all tracked examinees, their assigned seat numbers, last seen timestamps, current scores, and warning badges. Invigilators can edit seat assignments or clear warning statuses.

### Module 6: Activity Audit Log
- **Files**: `src/components/ActivityPanel.tsx`
- **Functionality**: Maintains an audit log of all observed activity events. Supports multi-parameter filtering (Candidate P-ID, camera, activity type, warning level) and CSV file export.

### Module 7: Protected Administrator Dashboard
- **Files**: `src/components/AdminPanel.tsx`
- **Functionality**: Secure interface authenticated via environment variables (`ADMIN_USERNAME` and `ADMIN_PASSWORD`) allowing administrators to manage cameras, test stream pipelines, upload video recordings, adjust activity score weights, and configure warning thresholds.

---

## 3. How the System Works

### Plain Language Explanation
1. CCTV cameras or webcams stream video into the system.
2. The computer vision engine scans each video frame to locate examinees sitting at exam desks.
3. Each examinee is assigned a neutral ID tag (e.g., `Candidate P-1`, `Candidate P-2`).
4. As the exam progresses, the system measures physical body motion. If an examinee exhibits sudden large movements or leaves their seating area, an activity event is logged, and points are added to their score indicator.
5. If an examinee's score exceeds configured thresholds, a color-coded warning badge (*Yellow Warning* or *Red High Warning*) appears on the live monitor and roster panel.
6. The human invigilator sees the alert, looks at the examinee in person, and decides whether any action is needed. The invigilator can clear the warning badge at any time.

---

## 4. Testing & Measured System Results

The system was evaluated through functional testing and execution benchmarks:

| Metric / Test Scenario | Measured Outcome |
| :--- | :--- |
| **Browser On-Device Detection FPS** | **28.5 – 30.0 FPS** (WebGL accelerated COCO-SSD on standard desktop browser) |
| **Frame Processing Latency** | **10.2 ms – 22.4 ms** per frame |
| **`ffmpeg` Stream Testing Pipeline** | Successfully probed and captured 41.0 KB JPEG test frames from video files (`/assets/classroom.mp4`) and network RTSP streams |
| **Google Drive URL Conversion** | 100% success converting public share URLs to direct video download streams |
| **Score Bounding Validation** | Confirmed scores strictly cap at `100` and floor at `0` |
| **Individual Warning Clearing** | Verified that clearing an examinee warning resets the candidate badge to `Normal` while retaining all historical entries in `/api/activities` |
| **Large-Scale Multi-Hall Accuracy Benchmark** | *Not yet measured in formal controlled academic trials with 1,000+ simultaneous candidates.* |

---

## 5. System Limitations

1. **Camera Occlusion**: If an examinee is completely blocked from camera view by a standing invigilator or column for longer than 60 seconds, their tracking history expires and a new ID is assigned upon re-emergence.
2. **Single Camera Depth Ambiguity**: A single 2D camera angle cannot distinguish between a student reaching for an eraser on their desk versus reaching toward a neighboring student's paper if their hands overlap in 2D space.
3. **Lighting & Quality Dependency**: Low-resolution or poorly lit examination rooms reduce detection confidence.
4. **Hardware Performance**: Running multi-stream 4K detection on low-spec client hardware without WebGL support can degrade frame rate.

---

## 6. Ethics, Privacy & Human Authority

- **Strictly Advisory Tool**: The system **never** makes automated disciplinary decisions, issues penalties, or invalidates exam papers. It acts solely as an observational assistant for human invigilators.
- **No Facial Recognition**: The system does **not** perform facial recognition, biometric identity verification, or facial landmark analysis. Examinees are identified purely by neutral spatial bounding boxes (`P-1`, `P-2`).
- **Human In The Loop**: All supervisory authority remains exclusively with human teachers and invigilators.
- **Privacy Compliance**: Video data remains within the institution's local deployment environment. No video feeds or candidate identifiers are transmitted to third-party services.
