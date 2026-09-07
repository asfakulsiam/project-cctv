# Architecture & System Design Document

**Title:** Smart Classroom Exam Monitoring System Using Computer Vision and Behavioral Analysis  
**Document Version:** 1.0.0 (Academic & Production Specification)

---

## 1. System Architecture Overview

The system adopts a **modular hybrid pipeline** combining an edge-capable Computer Vision engine with a high-throughput WebSocket broadcast server and an interactive Player-First React frontend.

```
+-------------------------------------------------------------------------------+
|                             CAMERA HARDWARE LAYER                             |
|  [ Camera 1: Frontal Main ]   [ Camera 2: Left Flank ]   [ Camera 3: Overhead ]|
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                    INDEPENDENT PER-CAMERA TRACKING ENGINE                     |
|  • Isolated ByteTrack Loop 1 -> Produces CAM1-S001, CAM1-S002                 |
|  • Isolated ByteTrack Loop 2 -> Produces CAM2-S001, CAM2-S002                 |
|  • Isolated ByteTrack Loop 3 -> Produces CAM3-S001, CAM3-S002                 |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                    TEMPORAL BEHAVIOR ANALYSIS HEURISTICS                      |
|  • Sustained Gaze Tracking (>3.5s window with debounce)                       |
|  • Face Occlusion Tracking (>4.0s grace window)                              |
|  • Desk Boundary Verification (>5.0s out-of-seat threshold)                  |
|  • Object/Phone Detector (Confidence floor >= 0.65)                           |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                        UNIFIED CROSS-CAMERA STUDENT MODEL                     |
|  • Spatial Homography / Desk Mapping: Links camera tracks to Student Records  |
|  • Clarity Score Arbitration: Resolves Best View Angle per candidate          |
|  • Deduplicated Present Count: 3 students in room => exactly 3 records        |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                    GATEWAY & EVENT DISPATCHER (Node/Express)                  |
|  • REST Configuration API (`/api/students`, `/api/cameras`, `/api/settings`)   |
|  • WebSocket Broadcast Engine (15 FPS Telemetry Stream)                       |
|  • MongoDB Storage Driver (Audits, Sessions, Incident Logs)                  |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                     PLAYER-FIRST REACT SPA PRESENTATION LAYER                 |
|  • Primary Camera 1 Live Video Player + Canvas CV Overlays (60 FPS RAF)       |
|  • Multi-Angle Secondary Strip + Instant View Switching                       |
|  • Interactive Student Inspection Drawer (Clarity Comparison)                 |
|  • Protected Admin Management Console (`/admin` + Session Auth)               |
+-------------------------------------------------------------------------------+
```

---

## 2. Multi-Camera Tracking Strategy: Strict Isolation

### The Cross-Camera ID Contamination Problem
In naive multi-camera systems, a single global tracker ID space is shared across all cameras. When a student is detected in Camera 1 as `ID: 1` and in Camera 2 as `ID: 1`, trackers frequently swap targets when students move or cameras glitch, resulting in tracker jitter, catastrophic trajectory merging, and false accusations.

### The Solution: Isolated Scoped Identifiers
Each camera feed runs an isolated instance of the tracking algorithm. Track IDs are prefixed with the camera identifier:
- Camera 1: `CAM1-S001`, `CAM1-S002`, `CAM1-S003`
- Camera 2: `CAM2-S001`, `CAM2-S002`, `CAM2-S003`
- Camera 3: `CAM3-S001`, `CAM3-S002`, `CAM3-S003`

These localized tracks are never mixed directly. Instead, they are fed as independent observations into the **Unified Student Model**.

---

## 3. Unified Student Model & Observation Fusion

A single candidate seated in Desk A-02 is observed simultaneously by Camera 1, Camera 2, and Camera 3. The Unified Student Model maps these 3 tracks into a single canonical `StudentRecord`:

```json
{
  "id": "stu-2",
  "student_id_number": "STU-2026-0441",
  "name": "Elena Rostova",
  "seat_id": "seat-2",
  "status": "present",
  "unified_suspicion_score": 42,
  "active_observations": [
    {
      "camera_id": "cam-1",
      "track_id": "CAM1-S002",
      "quality": 88,
      "is_best_view": false,
      "bbox": { "x": 0.38, "y": 0.28, "width": 0.22, "height": 0.44 }
    },
    {
      "camera_id": "cam-2",
      "track_id": "CAM2-S002",
      "quality": 95,
      "is_best_view": true,
      "bbox": { "x": 0.36, "y": 0.26, "width": 0.25, "height": 0.48 }
    }
  ]
}
```

### Observation Clarity Arbitration
When an invigilator clicks on Elena Rostova, the UI checks `is_best_view`. If Camera 1 has 88% clarity but Camera 2 has 95% clarity (due to less occlusion), the inspector proactively indicates:
> *"Camera 2 has a clearer view (95% observation clarity) — Click to switch focus."*

---

## 4. Behavioral Analysis & Temporal Cooldowns

Single-frame anomalies (a momentary blink, natural cough, adjusting glasses) must never trigger cheating penalties. The behavioral engine implements strict temporal windows:

$$\text{Alert Fired} \iff \Delta t_{\text{sustained}} \ge T_{\text{threshold}} \land \text{Cooldown Expired}$$

1. **Sustained Head Turn (`T = 3.5s`)**: Lateral yaw exceeding $\pm 25^\circ$ must persist continuously for 3.5 seconds before firing `LOOKING_LEFT` or `LOOKING_RIGHT`.
2. **Face Occlusion Grace Window (`T = 4.0s`)**: Face landmarks must be missing for over 4.0 seconds continuously to account for brief posture shifts or sneezing.
3. **Desk Boundary Grace Window (`T = 5.0s`)**: Bounding box center must deviate from assigned desk coordinates for $\ge 5.0$ seconds before penalizing `LEFT_SEAT`.

---

## 5. Explainable Additive Suspicion Score Equation

The suspicion score $S \in [0, 100]$ is computed as a deterministic sum of active behavioral penalties:

$$S = \min\left(100, \max(0, P_{\text{phone}} + P_{\text{seat}} + P_{\text{turn}} + P_{\text{face}} + P_{\text{motion}})\right)$$

Where default calibrated weights are:
- $P_{\text{phone}} = 40$ pts (Mobile phone detected with confidence $\ge 0.65$)
- $P_{\text{seat}} = 30$ pts (Candidate departed assigned examination desk)
- $P_{\text{turn}} = 25$ pts (Repeated or sustained glancing at neighbor's workspace)
- $P_{\text{face}} = 20$ pts (Candidate face actively obscured or hidden)
- $P_{\text{motion}} = 15$ pts (Abnormal rapid agitation or sudden posture surges)

---

## 6. Separate Admin Protection Architecture

The `/admin` route is decoupled from the public live stream:
- Protected by token-based authentication verified against environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).
- Administrative APIs reject unauthenticated requests with `401 Unauthorized`.
- Full audit trails of configuration updates (student ID corrections, camera source switches, rule modifications) are persisted directly into MongoDB.
