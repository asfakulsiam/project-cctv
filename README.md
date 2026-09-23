# Exam Hall Monitoring Assistant

The **Exam Hall Monitoring Assistant** is a real-time computer vision supervisory tool designed to assist human invigilators and teachers during examination monitoring. It ingests video feeds from multiple CCTV cameras or webcams, detects examinees in the exam hall, tracks them across temporal frames with persistent candidate identifiers (P-IDs), and calculates observable activity scores based on physical movements (e.g. posture rotation, rapid shifts, displacement from seat). **The system is strictly an advisory assistant and does not make automated disciplinary determinations; human invigilators retain sole authority for all supervisory judgments.**

## Real Working Features

- **Universal Camera Ingestion & Stream Testing**: Supports RTSP camera streams (`rtsp://`), IP camera streams (MJPEG/HTTP), live stream URLs (HLS `.m3u8`), cloud video share links (automatic conversion of Google Drive share links, S3, Dropbox), uploaded local video files, and browser webcam feeds. Features built-in `ffmpeg` pipeline testing to verify frame extraction.
- **On-Device & Server Computer Vision Pipeline**: Client-side neural human detection powered by TensorFlow.js COCO-SSD with spatial centroid tracking and exponential moving average (EMA) bounding box smoothing. Includes optional Python FastAPI microservice worker (`cv_service/main.py`) running YOLOv8 and ByteTrack.
- **Automated Model Download (Zero Path Configuration)**: The YOLOv8 model weights (`yolov8n.pt`) are automatically downloaded during installation. No searching for URLs or manual path editing is required.
- **Candidate Identifier & Spatial Tracking**: Assigns persistent P-IDs (e.g., `P-1`, `P-2`) to confirmed human examinees. Retains score history across brief temporary occlusions using a spatial centroid score archive.
- **Activity Motion Scoring & Threshold System**: Calculates cumulative examinee activity scores strictly bounded between 0 and 100 based on physical motion indicators. Categorizes examinee warning levels into *Normal* (0–35), *Warning* (36–70), and *High Warning* (71–100).
- **Interactive Live Monitor**: HTML5 video player featuring real-time SVG bounding box overlays, candidate highlight panels, activity ticker, and toggle controls for overlays and detection stats.
- **Candidate Roster Management**: Roster view listing all examinees with seat numbers, last seen timestamps, current activity scores, and warning badges. Allows invigilators to edit examinee metadata or clear individual warnings while preserving historical audit logs.
- **Activity Audit Log & Export**: Filterable timeline log recording every detected activity event. Supports filtering by Candidate P-ID, camera, activity type, or warning level, with full CSV export capabilities.
- **Protected Admin Panel**: Secure portal authenticated via environment variables (`ADMIN_USERNAME` and `ADMIN_PASSWORD`) with timing-safe comparison for adding/removing cameras, testing stream connections, uploading video files, customizing activity point weights, and adjusting score thresholds.
- **Persistent Database Engine**: Integrated MongoDB persistence for settings, score thresholds, camera configs, candidate rosters, and audit records (with automatic local file fallback if MongoDB is unconfigured).

## Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, Motion |
| **Backend Server** | Node.js (v20+), Express 4, TypeScript (`tsx`), Multer |
| **Persistence Database** | MongoDB (Official Driver) with local fallback (`/data/exam_monitoring.json`) |
| **On-Device Vision** | TensorFlow.js, `@tensorflow-models/coco-ssd` |
| **Python CV Worker (Opt.)** | Python 3, FastAPI, Uvicorn, OpenCV (`cv2`), Ultralytics YOLOv8, ByteTrack |
| **Stream Processing** | `ffmpeg` CLI (system spawn process) |

## Quick Start (Single Command)

### 1. One-Command Setup
```bash
# Installs npm dependencies, downloads yolov8n.pt model, & installs Python packages
npm run setup
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env to set your ADMIN_USERNAME, ADMIN_PASSWORD, and optional MONGODB_URI
```

### 3. One-Command Start

#### For Development:
```bash
npm run dev
# Open http://localhost:3000
```

#### For Production (Builds & starts server in one command):
```bash
npm run prod
# Bundles Vite frontend & server and starts production Express on configured PORT
```

## Documentation Links

- **[Render Deployment Guide](RENDER_DEPLOYMENT_GUIDE.md)**: Complete step-by-step walkthrough for deploying to Render.com with free MongoDB Atlas cloud persistence and blueprint support.
- **[Beginner Setup & Deployment Guide](BEGINNER_SETUP_AND_DEPLOYMENT_GUIDE.md)**: Step-by-step instructions for brand-new environments, setting up environment variables, adding cameras screen-by-screen, and production deployment.
- **[System Architecture](ARCHITECTURE.md)**: Data flow pipeline, system ASCII diagram, API endpoint documentation, and technical design rationale.
- **[Academic Report](ACADEMIC_REPORT.md)**: Problem statement, module breakdown, experimental testing findings, limitations, and ethical considerations.
- **[Project Status Checklist](PROJECT_STATUS.md)**: Feature checklist tracking completion status based on codebase verification.
- **[University Thesis Document](THESIS.md)**: Formal academic thesis submission document.
