# Smart Classroom Exam Monitoring System Using Computer Vision and Behavioral Analysis

A minimal, efficient, professional, and production-ready academic system built entirely on free and open-source software (OpenCV, YOLO/ByteTrack, MongoDB, Node.js/Express, React, and Tailwind CSS).

---

## 1. System Overview

The **Smart Classroom Exam Monitoring System** is engineered with a **Player-First** monitoring paradigm. When proctors, invigilators, or evaluators open the application, they are immediately presented with a high-fidelity live classroom video player with live computer vision overlays, independent multi-angle camera feeds, and a real-time behavioral activity stream.

### Key Capabilities
- **Player-First Live Monitoring Interface**: Large Primary Camera 1 video player with zoom, canvas-rendered bounding boxes, head pose vectors, face visibility indicators, and confidence tags.
- **Strict Independent Camera Trackers**: Every camera executes an isolated ByteTrack tracking loop with localized identifiers (`CAM1-S001`, `CAM2-S001`) preventing cross-camera ID pollution.
- **Unified Cross-Camera Student Model**: An association engine fuses multiple camera angles using homography/desk mapping and temporal consistency without duplicating students.
- **Explainable Additive Suspicion Scoring (0–100)**: Eliminates "black-box" outputs by calculating penalties based on explicit, inspectable behavioral triggers (phone detection, face occlusion, sustained glancing, leaving desk).
- **Temporal Persistence & Cooldowns**: Eliminates single-frame false positives with configurable duration windows (e.g. 3.5s gaze duration, 4.0s face occlusion grace period).
- **Separate, Protected Admin Console (`/admin`)**: Environment-authenticated administrative panel allowing student roster enrollment, ID number corrections, camera source selection, primary camera reassignment, CV weight tuning, and institutional branding.
- **Academic Audit & Defense Export**: On-demand generation of comprehensive invigilator reports, student breakdowns, and CSV incident exports for viva presentation.

---

## 2. Quick Start & Execution

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+ (for standalone Python CV pipeline / edge execution)
- Optional: MongoDB instance (or uses embedded resilient memory-file persistence by default)

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd smart-classroom-exam-monitoring

# Install frontend and backend gateway dependencies
npm install

# Optional: Install standalone Python CV dependencies
pip install -r cv/requirements.txt
```

### Running the System
```bash
# Start the full-stack system (Express API + WebSocket Gateway + React Dev Server)
npm run dev

# The system binds to http://localhost:3000
```

Open `http://localhost:3000` in your web browser:
- **Public Route (`/`)**: Opens directly into the **Live Video Monitoring Player**.
- **Admin Route (`/admin`)**: Dedicated management portal. Default credentials:
  - **Username**: `admin`
  - **Password**: `academic_exam_2026`

---

## 3. Technology Stack & Design Decisions

| Subsystem | Technology | Architectural Rationale |
| :--- | :--- | :--- |
| **CV Detection & Tracking** | Python 3, OpenCV, ByteTrack, YOLO | Free, open-source, local-first inference; zero paid cloud API dependencies. |
| **Backend Gateway** | Node.js, Express, `ws` WebSockets | High-concurrency event broadcasting; lightweight low-latency JSON telemetry streaming. |
| **Data Persistence** | MongoDB / Embedded Engine | Structured document storage for session records, student logs, and configuration. |
| **Frontend Architecture** | React 18, TypeScript, Tailwind CSS | Modular component hierarchy, strict type safety, zero layout boilerplate. |
| **CV Canvas Rendering** | HTML5 2D Canvas + `requestAnimationFrame` | Zero DOM overhead, butter-smooth 60 FPS bounding box and pose vector rendering. |

---

## 4. Verification & Testing

### Running the Python CV Test Suite
```bash
python3 cv/test_cv_pipeline.py
```
*Executes isolated unit tests verifying independent tracking ID generation, temporal cooldown enforcement, unified student association, and camera failure recovery.*

### Linting & Production Build
```bash
# Run TypeScript type safety and linting verification
npm run lint

# Compile production bundles
npm run build
```
