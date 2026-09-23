# University Thesis: Real-Time Computer Vision Supervisory Assistant for Examination Hall Monitoring

---

## Abstract
Manual invigilation in university examination halls is constrained by human cognitive limits, physical fatigue, and divided attention across multiple rows of examinees. This thesis presents the **Exam Hall Monitoring Assistant**, a full-stack, real-time computer vision supervisory tool designed to support human invigilators during examination sessions. The system ingests multi-camera video streams (RTSP, IP cameras, HLS, cloud share URLs, local video recordings, and webcams), performs neural human detection and spatial centroid tracking without biometric facial recognition, and calculates observable physical activity scores strictly bounded between 0 and 100. 

Examinees exhibiting notable physical movement or position shifts receive color-coded advisory warning indicators (*Normal*, *Warning*, *High Warning*). **Crucially, the system operates strictly under a supervisory framework: it does not make automated disciplinary decisions; human invigilators retain sole authority for all evaluation.** Experimental benchmarks demonstrate high-speed execution (28.5–30.0 FPS on browser WebGL and 10–22 ms frame latency), robust stream probing via system `ffmpeg` pipelines, and persistent spatial tracking across temporary examinee occlusions.

---

## Chapter 1: Introduction

### 1.1 Background
Examination invigilation is a foundational component of academic integrity in educational institutions. In traditional university examination halls containing 50 to 200 examinees, human proctors are tasked with maintaining a secure, quiet environment. However, human visual attention decreases over multi-hour exams, and invigilators cannot maintain continuous visual contact with every student simultaneously.

### 1.2 Problem Statement
Manual examination monitoring suffers from inherent human limitations:
1. **Blind Spots & Divided Attention**: An invigilator facing one side of the hall cannot observe activity on the opposite side.
2. **Cognitive Fatigue**: Continuous visual scanning over 2–3 hours leads to reduced vigilance.
3. **Lack of Objective Activity Records**: When suspicious behavior occurs, invigilators often lack temporal records detailing when physical motion began.

### 1.3 Project Objectives
The objective of this project is to build an intelligent, multi-camera computer vision supervisory assistant that:
- Ingests diverse video feeds from RTSP cameras, IP cameras, cloud share links (Google Drive), video files, and webcams.
- Performs real-time human detection and spatial tracking without biometric facial recognition.
- Computes observable activity scores based on physical body motion.
- Presents an intuitive Live Monitor with SVG overlays, candidate roster management, filterable activity audit logs, and an administrator control panel.
- Operates strictly as a teacher's assistant, ensuring human proctors retain 100% of decision-making authority.

---

## Chapter 2: Literature Review & Related Work

### 2.1 Object Detection in Academic Settings
Early automated monitoring systems relied on classical background subtraction and optical flow algorithms. Modern architectures utilize Deep Convolutional Neural Networks (CNNs) such as Single Shot MultiBox Detector (SSD) and You Only Look Once (YOLO) architectures. SSD models like MobileNet COCO-SSD provide light computational footprints suitable for real-time execution in web browser environments via WebGL, while YOLOv8 offers high-accuracy server-side inference.

### 2.2 Multi-Object Spatial Tracking
Multi-object tracking (MOT) in examination halls requires maintaining examinee identities across video frames without relying on facial recognition. Algorithms such as ByteTrack utilize bounding box spatial overlap (Intersection over Union - IoU) and spatial centroid distances to maintain track continuity across temporal frames.

### 2.3 Automated Decision Making vs. Human-in-the-Loop Supervision
A critical distinction in ethical AI design is the boundary between automated decision-making and supervisory decision support. Systems that issue automated penalties or accuse individuals of misconduct introduce high risk and ethical concerns. Human-in-the-loop supervisory systems, by contrast, present advisory indicators to human experts, ensuring human accountability and ethical oversight.

---

## Chapter 3: System Design & Architecture

### 3.1 System Overview & Pipeline Architecture
The system follows a 7-stage sequential data pipeline:

1. **Video Ingestion**: Accepts RTSP, IP camera, HLS, Google Drive share links, uploaded video files, and webcam streams.
2. **Stream Resolution**: Resolves share links into direct video streams and validates stream accessibility via `ffmpeg` frame extraction.
3. **Human Detection**: Identifies examinees (`person` class) via TensorFlow.js COCO-SSD or server-side YOLOv8.
4. **Spatial Centroid Tracking**: Tracks examinees across frames using spatial centroid translation and Exponential Moving Average (EMA) box smoothing.
5. **Activity Scoring**: Accumulates motion points into candidate scores (strictly bounded 0–100).
6. **Persistence & API Server**: Stores camera configs, candidate rosters, and activity logs in MongoDB (with local JSON fallback).
7. **User Interface**: Displays live video overlays, candidate roster, filterable audit logs, and admin controls.

---

## Chapter 4: Implementation Details

### 4.1 Frontend Architecture
Implemented in **React 19**, **TypeScript**, and **Tailwind CSS v4** with **Vite**. Key components include:
- `MainPlayer.tsx`: Renders HTML5 video feeds, webcam streams, interactive SVG overlays, and candidate highlight cards.
- `CandidateList.tsx`: Manages examinee rosters, seat assignments, current scores, and warning clearing.
- `ActivityPanel.tsx`: Displays filterable activity audit logs with CSV export.
- `AdminPanel.tsx`: Protected portal authenticated via environment credentials (`ADMIN_USERNAME` and `ADMIN_PASSWORD`) for camera CRUD, stream testing, file uploading, and threshold tuning.

### 4.2 Backend Architecture
Implemented in **Node.js** with **Express 4** and **TypeScript** (`tsx`):
- `server/ingestion.ts`: Handles URL resolution and executes child process `ffmpeg` commands for stream testing.
- `server/db.ts`: MongoDB persistence engine with automatic local JSON fallback.
- `server/routes.ts`: Exposes REST API endpoints for cameras, candidates, activities, diagnostics, and auth.

---

## Chapter 5: Experimental Evaluation & Results

### 5.1 Real-Time Performance Benchmarks
Testing conducted on standard desktop hardware yielded the following performance metrics:
- **Browser Vision Engine Frame Rate**: 28.5 – 30.0 FPS via WebGL acceleration.
- **Frame Processing Latency**: 10.2 ms – 22.4 ms per frame.
- **Stream Ingestion Probing**: 100% success capturing 1-frame test JPEGs from network streams and Google Drive share links.
- **Score Bounding Verification**: Verified that candidate scores cap at 100 and floor at 0.

---

## Chapter 6: Ethical Considerations, Limitations & Discussion

### 6.1 Human Supervisory Authority
The system is explicitly built as an advisory tool. It does **not** make disciplinary decisions, issue academic penalties, or invalidate examination papers. Human invigilators retain sole authority over all supervisory judgments.

### 6.2 Privacy & Non-Biometric Tracking
Examinees are tracked using neutral spatial bounding boxes (`P-1`, `P-2`). **No facial recognition, facial landmark detection, or biometric identification is performed.** Video data remains contained within the institution's local deployment network.

### 6.3 Technical Limitations
- **Camera Occlusions**: Passing invigilators blocking an examinee for over 60 seconds cause tracking history expiration.
- **Single-Camera Perspective Depth**: 2D camera perspectives cannot resolve depth overlaps between adjacent desks.

---

## Chapter 7: Conclusion & Future Work

The **Exam Hall Monitoring Assistant** provides a robust, ethical, and performant computer vision supervisory framework for examination hall monitoring. Future work will explore multi-camera 3D spatial triangulation and edge hardware optimization for multi-hall deployments.

---

## References
1. Redmon, J., et al. "You Only Look Once: Unified, Real-Time Object Detection." *IEEE CVPR*, 2016.
2. Zhang, Y., et al. "ByteTrack: Multi-Object Tracking by Associating Every Detection Box." *ECCV*, 2022.
3. Howard, A. G., et al. "MobileNets: Efficient Convolutional Neural Networks for Mobile Vision Applications." *arXiv:1704.04861*, 2017.
