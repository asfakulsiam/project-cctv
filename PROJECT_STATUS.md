# PROJECT_STATUS.md
## Smart Classroom Exam Monitoring System Using Computer Vision and Behavioral Analysis

**Status:** In Active Implementation  
**Architecture:** Player-First Live Computer Vision Monitoring & Distributed Multi-Camera Analysis  
**Repository Audit Date:** September 2026  

---

### Initial Repository Audit
1. **Initial State Assessment:**
   - Empty starter React 19 app with basic Vite scaffolding.
   - `metadata.json` had empty placeholder title and description.
   - No computer vision processing, camera streams, backend endpoints, or database models.
   - Strict requirement adherence: Player-First interface (Camera 1 primary), independent multi-camera tracking contexts (`CAM1-S001`, `CAM2-S001`), unified cross-camera student models, no mock data in production flows, dedicated protected `/admin` route with env credentials, MongoDB persistence with graceful local memory fallback, and complete academic reports/documentation.

2. **Core Architectural Invariants:**
   - **Player-First UX:** Primary camera (Camera 1 by default) dominates view with responsive zoom/pan/focus controls. Secondary cameras appear as interactive thumbnail feeds that can be promoted to focus without resetting tracking state.
   - **Per-Camera Tracking Isolation:** Every live camera maintains its own independent tracking context. IDs are prefixed (e.g., `CAM1-S001`) preventing cross-camera collisions.
   - **Unified Student Model:** When multiple cameras observe the same classroom/seat, observations are mapped into a single student record based on seat mapping / spatial association without creating duplicate students.
   - **Camera Quality Observation:** Clearer camera angles prioritized for behavioral scoring when multiple cameras observe the same subject.
   - **Realtime CV & Temporal Behavioral Scoring:** Explainable scoring based on persistence, head pose/gaze heuristics, face visibility grace periods, leaving seat detection, and object/phone detection with cooldowns.
   - **Database & Offline Robustness:** MongoDB model architecture with automatic fallback store if external MongoDB is offline, strictly zero fake telemetry.
   - **Security:** Protected `/admin` panel using environment credentials (`ADMIN_USERNAME`, `ADMIN_PASSWORD`), public monitoring view accessible for classroom display.

---

### Implementation Phases Tracker

- [x] **Audit & Project Setup**: `metadata.json`, `index.html`, dependencies (`ws`, `mongodb`), project status.
- [ ] **Phase 1: Shared Domain Types & Design Foundation**: `src/types.ts` defining all entities (Cameras, Tracks, Students, Classrooms, Seats, Behavior Events, Suspicion Scores, Settings, Reports).
- [ ] **Phase 2: Database Layer & Persistent Models**: MongoDB client with schemas and fallback in-memory store in `server/db.ts`.
- [ ] **Phase 3: Multi-Camera CV Engine & Pipeline**:
  - Independent tracker per camera (`server/cv/tracker.ts`, `server/cv/detector.ts`, `server/cv/behavior.ts`).
  - Python CV standalone pipeline in `cv/` with OpenCV/YOLO/ByteTrack scripts, test suites, and documentation for academic viva.
  - Video stream generator and live camera feed ingest (supporting browser webcam, video clips, and live synthetic exam feeds).
- [ ] **Phase 4: Backend API & WebSocket Server (`server.ts`)**:
  - REST endpoints for cameras, students, classrooms, seats, exams, reports, settings, admin authentication.
  - WebSocket hub broadcasting live frame coordinates, bounding boxes, telemetry, and behavior events.
- [ ] **Phase 5: Player-First Frontend Architecture**:
  - Main Player Component with Canvas overlay, zoom/pan controls, bounding boxes with unique IDs, behavior badges.
  - Secondary Camera Strip with quick switcher & focus promotion.
  - Live Statistics bar & Activity Timeline.
  - Camera observation quality selector.
- [ ] **Phase 6: Separate Protected Admin Panel (`/admin`)**:
  - Admin login gate with env-configured credentials.
  - Student manager (editing student ID numbers, mapping names/seats).
  - Classroom & Seat layout editor.
  - Multi-Camera manager (sources, primary toggle, FPS, thresholds).
  - Behavior rules & score weights editor.
  - Branding and public display settings.
  - Real database report generator & export (CSV, JSON, print format).
- [ ] **Phase 7: Academic Documentation Suite**:
  - `README.md`
  - `DEVELOPER_GUIDE.md`
  - `workflow.md`
  - `MASTER_PROJECT_REPORT.md` (Comprehensive academic thesis/report with Mermaid diagrams)
  - `MASTER_PRESENTATION.md` (10-15 slides + viva Q&A)
  - `DEPLOYMENT_GUIDE.md`
- [ ] **Phase 8: End-to-End Verification & QA**:
  - Lint and build verification.
  - Full end-to-end user journey verification.
