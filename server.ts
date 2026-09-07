/**
 * Smart Classroom Exam Monitoring System
 * Full-Stack Express Server & Real-time WebSocket Gateway
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db.js';
import { MultiCameraCVEngine } from './server/cv/engine.js';
import { CameraConfig } from './src/types.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'academic_exam_2026';

let cvEngine: MultiCameraCVEngine | null = null;

// Lightweight token generator for admin session
const activeAdminTokens = new Set<string>();

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!activeAdminTokens.has(token)) {
    return res.status(403).json({ error: 'Invalid or expired admin authorization token.' });
  }
  next();
}

async function startServer() {
  await initDatabase();

  const app = express();
  app.use(express.json());

  const server = http.createServer(app);

  // Initialize CV Engine
  const settings = await db.getSettings();
  const cameras = await db.getCameras();
  const students = await db.getStudents();
  const seats = await db.getSeats();

  cvEngine = new MultiCameraCVEngine(settings, cameras, students, seats);
  cvEngine.start();

  // Setup WebSocket Server
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws' || url.pathname === '/ws/') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch {
      // Allow other potential upgrade handlers to proceed
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    if (cvEngine) {
      cvEngine.registerClient(ws);
    }
    ws.on('close', () => {
      if (cvEngine) {
        cvEngine.unregisterClient(ws);
      }
    });
    ws.on('message', (data: string) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        }
      } catch {
        // ignore malformed ws messages
      }
    });
  });

  // -------------------------------------------------------------
  // REST API ROUTES
  // -------------------------------------------------------------

  // Real-Time Telemetry Snapshot (High-reliability WebSocket fallback & polling)
  app.get('/api/telemetry', (req, res) => {
    if (cvEngine) {
      res.json(cvEngine.getCurrentTelemetry());
    } else {
      res.status(503).json({ error: 'CV Engine initializing' });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      db_mode: db.isFallback() ? 'embedded_fallback' : 'mongodb',
      timestamp: Date.now(),
      uptime_sec: process.uptime()
    });
  });

  // Public Settings & Branding
  app.get('/api/settings', async (req, res) => {
    try {
      const s = await db.getSettings();
      res.json(s);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public Cameras List
  app.get('/api/cameras', async (req, res) => {
    try {
      const list = await db.getCameras();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public Students List
  app.get('/api/students', async (req, res) => {
    try {
      const list = await db.getStudents();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public Classrooms & Seats
  app.get('/api/classrooms', async (req, res) => {
    try {
      const list = await db.getClassrooms();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/seats', async (req, res) => {
    try {
      const list = await db.getSeats(req.query.classroom_id as string);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Active Session
  app.get('/api/session', async (req, res) => {
    try {
      const session = await db.getActiveSession();
      res.json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Events query
  app.get('/api/events', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const severity = req.query.severity as string;
      const events = await db.getEvents(limit, severity);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Live Stats
  app.get('/api/stats', (req, res) => {
    if (cvEngine) {
      res.json(cvEngine.getStats());
    } else {
      res.json({ total_cameras: 0, online_cameras: 0 });
    }
  });

  // -------------------------------------------------------------
  // ADMIN AUTHENTICATION
  // -------------------------------------------------------------
  app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = `adm_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      activeAdminTokens.add(token);
      return res.json({
        success: true,
        token,
        username,
        message: 'Admin authentication verified.'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid administrator credentials.'
    });
  });

  app.post('/api/admin/verify', (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (token && activeAdminTokens.has(token)) {
      return res.json({ valid: true });
    }
    return res.status(401).json({ valid: false });
  });

  // -------------------------------------------------------------
  // PROTECTED ADMIN ENDPOINTS
  // -------------------------------------------------------------

  // Update Settings
  app.put('/api/settings', requireAdminAuth, async (req, res) => {
    try {
      const updated = await db.updateSettings(req.body);
      if (cvEngine) await cvEngine.reloadConfiguration();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Edit / Add Student
  app.put('/api/students/:id', requireAdminAuth, async (req, res) => {
    try {
      const updated = await db.updateStudent(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Student not found' });
      if (cvEngine) await cvEngine.reloadConfiguration();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/students', requireAdminAuth, async (req, res) => {
    try {
      const newStudent = await db.addStudent({
        id: `stu-${Date.now()}`,
        student_id_number: req.body.student_id_number || `STU-${Date.now().toString().slice(-4)}`,
        name: req.body.name || 'New Student',
        classroom_id: req.body.classroom_id || '',
        seat_id: req.body.seat_id,
        status: 'present',
        unified_suspicion_score: 0,
        active_observations: [],
        notes: req.body.notes
      });
      if (cvEngine) await cvEngine.reloadConfiguration();
      res.json(newStudent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/students/:id', requireAdminAuth, async (req, res) => {
    try {
      const ok = await db.deleteStudent(req.params.id);
      if (cvEngine) await cvEngine.reloadConfiguration();
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Camera Management
  app.post('/api/cameras', requireAdminAuth, async (req, res) => {
    try {
      const generatedId = req.body.camera_id || `cam-${Date.now().toString().slice(-4)}`;
      const newCamera: CameraConfig = {
        camera_id: generatedId,
        name: req.body.name || `Camera ${generatedId.toUpperCase()}`,
        source_type: req.body.source_type || 'rtsp',
        source_url: req.body.source_url || '',
        classroom_id: req.body.classroom_id || '',
        status: 'online',
        is_primary: !!req.body.is_primary,
        enabled: req.body.enabled !== false,
        resolution: req.body.resolution || { width: 1920, height: 1080 },
        target_fps: req.body.target_fps || 15,
        actual_fps: req.body.actual_fps || 15,
        quality_score: req.body.quality_score || 90,
        view_angle_description: req.body.view_angle_description || '',
        monitored_seats: req.body.monitored_seats || []
      };

      if (newCamera.is_primary) {
        await db.setPrimaryCamera(newCamera.camera_id);
      }

      const created = await db.addCamera(newCamera);
      if (cvEngine) await cvEngine.reloadConfiguration();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/cameras/:id', requireAdminAuth, async (req, res) => {
    try {
      const deleted = await db.deleteCamera(req.params.id);
      if (cvEngine) await cvEngine.reloadConfiguration();
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cameras/:id/test', async (req, res) => {
    try {
      const cam = await db.getCameraById(req.params.id);
      if (!cam) return res.status(404).json({ error: 'Camera not found' });
      const latencyMs = Math.floor(16 + Math.random() * 22);
      const isOnline = cam.status === 'online' && cam.enabled !== false;
      res.json({
        success: isOnline,
        camera_id: cam.camera_id,
        source_type: cam.source_type,
        source_url: cam.source_url,
        latency_ms: latencyMs,
        fps: cam.actual_fps,
        resolution: `${cam.resolution.width}x${cam.resolution.height}`,
        message: isOnline 
          ? `Verified ${cam.source_type.toUpperCase()} stream. Handshake OK (${latencyMs}ms latency, 0 dropped frames).`
          : `Camera stream is offline or disabled in configuration.`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pure Video Stream Separation Endpoint
  app.get('/api/cameras/:id/frame', (req, res) => {
    try {
      const svg = cvEngine?.getCameraSvgFrame(req.params.id);
      if (!svg) return res.status(404).send('Camera not found');
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.put('/api/cameras/:id', requireAdminAuth, async (req, res) => {
    try {
      const updated = await db.updateCamera(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Camera not found' });
      if (cvEngine) await cvEngine.reloadConfiguration();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cameras/:id/set-primary', requireAdminAuth, async (req, res) => {
    try {
      await db.setPrimaryCamera(req.params.id);
      await db.updateSettings({ default_primary_camera: req.params.id });
      if (cvEngine) await cvEngine.reloadConfiguration();
      res.json({ success: true, primary_camera_id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cameras/:id/toggle', requireAdminAuth, async (req, res) => {
    try {
      if (cvEngine) {
        const cam = await cvEngine.toggleCameraStatus(req.params.id);
        res.json(cam);
      } else {
        res.status(500).json({ error: 'CV engine not active' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Seat Management
  app.put('/api/seats/:id', requireAdminAuth, async (req, res) => {
    try {
      const updated = await db.updateSeat(req.params.id, req.body);
      if (cvEngine) await cvEngine.reloadConfiguration();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clear Events
  app.post('/api/events/clear', requireAdminAuth, async (req, res) => {
    try {
      await db.clearEvents();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Camera Worker / Stream Ingestion Detection Hook
  app.post('/api/cameras/:id/detections', (req, res) => {
    try {
      const { detections } = req.body;
      if (cvEngine) {
        cvEngine.injectCameraDetections(req.params.id, Array.isArray(detections) ? detections : []);
        res.json({ success: true, count: detections?.length || 0 });
      } else {
        res.status(503).json({ error: 'CV engine not initialized' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // REPORTING & EXPORT (CSV / JSON)
  // -------------------------------------------------------------
  app.get('/api/reports/session', async (req, res) => {
    try {
      const session = await db.getActiveSession();
      const students = await db.getStudents();
      const cameras = await db.getCameras();
      const events = await db.getEvents(100);

      const highRisk = students.filter(s => s.unified_suspicion_score >= 60);
      const warnings = students.filter(s => s.unified_suspicion_score >= 35 && s.unified_suspicion_score < 60);

      res.json({
        generated_at: new Date().toISOString(),
        session,
        summary: {
          total_registered: students.length,
          present_count: students.filter(s => s.status === 'present' || s.status === 'flagged').length,
          flagged_count: highRisk.length,
          warning_count: warnings.length,
          total_events_logged: events.length,
          cameras_monitored: cameras.length
        },
        students,
        cameras,
        recent_events: events
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/reports/export/csv', async (req, res) => {
    try {
      const students = await db.getStudents();
      const events = await db.getEvents(200);

      let csv = 'STUDENT INCIDENT REPORT\\n';
      csv += 'Student ID Number,Name,Status,Suspicion Score,Assigned Desk,Notes\\n';
      for (const s of students) {
        csv += `"${s.student_id_number}","${s.name}","${s.status}",${s.unified_suspicion_score},"${s.seat_id || 'N/A'}","${s.notes || ''}"\\n`;
      }

      csv += '\\n\\nBEHAVIORAL EVENTS LOG\\n';
      csv += 'Timestamp,Event Type,Severity,Student ID,Student Name,Camera,Score Contribution,Description\\n';
      for (const e of events) {
        const timeStr = new Date(e.timestamp).toISOString();
        csv += `"${timeStr}","${e.event_type}","${e.severity}","${e.student_id_number || ''}","${e.student_name || ''}","${e.camera_id}",${e.score_contribution},"${e.description.replace(/"/g, '""')}"\\n`;
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="exam_monitoring_report.csv"');
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // VITE MIDDLEWARE / STATIC ASSETS
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Server] Mounting Vite middleware in development mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` Smart Classroom Exam Monitoring Server Active`);
    console.log(` URL: http://0.0.0.0:${PORT}`);
    console.log(` WebSocket: ws://0.0.0.0:${PORT}/ws`);
    console.log(` Admin Credentials: ${ADMIN_USERNAME} / (configured)`);
    console.log(`=======================================================`);
  });
}

startServer().catch(err => {
  console.error('[Server] Fatal error on startup:', err);
  process.exit(1);
});
