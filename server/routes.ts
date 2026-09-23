/**
 * server/routes.ts - Express REST API Router
 * Defines REST endpoints for cameras, file uploads, stream testing, candidate management,
 * activity logging, score thresholds, system diagnostics, data exports, and administrator authentication.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from './db.js';
import { cvClient } from './cvClient.js';
import { resolveSourceUrl, testSourceConnection } from './ingestion.js';
import { handleCloudStream } from './cloudStream.js';
import { parseCloudVideoLink } from '../src/utils/cloudVideoHandler.js';
import { CameraSource, ActivityTypeConfig } from '../src/types.js';

export const apiRouter = Router();

// Cloud Video Stream Proxy & Resolver for Google Drive, Dropbox, Box, etc.
apiRouter.get('/cloud-stream', handleCloudStream);
apiRouter.head('/cloud-stream', handleCloudStream);

apiRouter.get('/cloud-video/resolve', (req: Request, res: Response) => {
  const url = (req.query.url as string) || '';
  if (!url) {
    res.status(400).json({ error: 'url parameter is required' });
    return;
  }
  const info = parseCloudVideoLink(url);
  res.json(info);
});

// Configure disk storage for file_upload cameras
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `file-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB max
});

// Helper for timing-safe string comparison
function safeTimingCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// --- Health & Diagnostics ---
apiRouter.get('/health', async (req: Request, res: Response) => {
  const cvStatus = await cvClient.checkHealth();
  const diagnostics = cvClient.getDiagnostics();
  res.json({
    status: 'ok',
    backend: 'online',
    cvWorker: cvStatus,
    diagnostics,
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get('/cv/health', async (req: Request, res: Response) => {
  const status = await cvClient.checkHealth();
  res.json(status);
});

apiRouter.get('/diagnostics', (req: Request, res: Response) => {
  res.json(cvClient.getDiagnostics());
});

// --- Computer Vision Frame Processing ---
apiRouter.post('/cv/sync-detections', async (req: Request, res: Response) => {
  try {
    const { cameraId, detections, newActivities } = req.body;
    const result = await cvClient.syncDetections({
      cameraId: cameraId || 'cam-1',
      detections: detections || [],
      newActivities: newActivities || [],
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error syncing detections' });
  }
});

apiRouter.post('/cv/process-frame', async (req: Request, res: Response) => {
  try {
    const { cameraId, imageBase64, timestamp, conf } = req.body;
    if (!imageBase64) {
      res.status(400).json({ error: 'imageBase64 is required' });
      return;
    }

    const result = await cvClient.processFrame({
      cameraId: cameraId || 'cam-1',
      imageBase64,
      timestamp,
      conf,
    });

    res.json(result);
  } catch (err: any) {
    res.status(502).json({
      error: err?.message || 'Error executing computer vision pipeline',
      details: 'Computer vision worker failed or is unavailable.',
      timestamp: new Date().toISOString(),
    });
  }
});

apiRouter.post('/cv/reset-tracks', async (req: Request, res: Response) => {
  try {
    const { cameraId } = req.body;
    await db.setTrackingStatusAll(cameraId || 'cam-1', false);
    res.json({ status: 'ok', message: 'Tracking state reset.' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error resetting tracks' });
  }
});

// --- Universal Video Source Routes ---
apiRouter.post('/cameras/test-source', async (req: Request, res: Response) => {
  try {
    const { sourceType, sourceUrl, username, password } = req.body;
    if (!sourceUrl || !sourceUrl.trim()) {
      res.status(400).json({ success: false, message: 'Source URL or file path is required.' });
      return;
    }

    if (sourceType === 'webcam') {
      res.json({
        success: true,
        message: 'Connected (Webcam stream ingest via browser getUserMedia API).',
        resolvedUrl: 'webcam',
      });
      return;
    }

    const result = await testSourceConnection(sourceUrl, username, password);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: `Pipeline Error: ${err?.message || 'Failed to test stream connection.'}`,
    });
  }
});

apiRouter.post('/cameras/upload', upload.single('videoFile'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No video file was uploaded' });
    return;
  }
  const relativePath = `/uploads/${req.file.filename}`;
  const resolvedPath = resolveSourceUrl(relativePath);
  res.json({
    filePath: relativePath,
    filename: req.file.filename,
    originalName: req.file.originalname,
    resolvedUrl: resolvedPath,
    sizeBytes: req.file.size,
  });
});

apiRouter.get('/cameras/resolve-url', (req: Request, res: Response) => {
  const rawUrl = req.query.url as string;
  const username = req.query.username as string;
  const password = req.query.password as string;
  if (!rawUrl) {
    res.status(400).json({ error: 'url parameter is required' });
    return;
  }
  const resolved = resolveSourceUrl(rawUrl, username, password);
  res.json({ rawUrl, resolvedUrl: resolved });
});

// --- Cameras CRUD ---
apiRouter.get('/cameras', async (req: Request, res: Response) => {
  try {
    res.json(db.getCameras());
  } catch (err: any) {
    res.status(500).json({ error: 'Database query failed: ' + err?.message });
  }
});

apiRouter.get('/cameras/:id', async (req: Request, res: Response) => {
  const camera = db.getCamera(req.params.id);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }
  res.json(camera);
});

apiRouter.post('/cameras', async (req: Request, res: Response) => {
  try {
    const { name, sourceType, sourceUrl, username, password, location, enabled, resolution, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Camera name is required' });
      return;
    }
    if (sourceType !== 'webcam' && (!sourceUrl || typeof sourceUrl !== 'string' || !sourceUrl.trim())) {
      res.status(400).json({ error: 'Camera source URL or file path is required' });
      return;
    }

    const cleanSourceUrl = sourceType === 'webcam' ? 'webcam' : sourceUrl.trim();
    const resolvedUrl = resolveSourceUrl(cleanSourceUrl, username, password);

    const newCam: CameraSource = {
      id: `cam-${Date.now()}`,
      name: name.trim(),
      sourceType: sourceType || 'stream_url',
      sourceUrl: cleanSourceUrl,
      username: username ? String(username).trim() : undefined,
      password: password ? String(password).trim() : undefined,
      resolvedUrl,
      location: location ? String(location).trim() : 'Exam Hall',
      enabled: enabled !== false,
      status: 'active',
      resolution: resolution || '1920x1080',
      description: description ? String(description).trim() : undefined,
    };

    const saved = await db.saveCamera(newCam);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save camera to database: ' + err?.message });
  }
});

apiRouter.put('/cameras/:id', async (req: Request, res: Response) => {
  try {
    const existing = db.getCamera(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Camera not found' });
      return;
    }

    const resolvedUrl = resolveSourceUrl(
      req.body.sourceUrl || existing.sourceUrl,
      req.body.username !== undefined ? req.body.username : existing.username,
      req.body.password !== undefined ? req.body.password : existing.password
    );

    const updated: CameraSource = {
      ...existing,
      ...req.body,
      resolvedUrl,
      id: req.params.id,
    };
    const saved = await db.saveCamera(updated);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update camera in database: ' + err?.message });
  }
});

apiRouter.delete('/cameras/:id', async (req: Request, res: Response) => {
  try {
    const success = await db.deleteCamera(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Camera not found or could not be deleted' });
      return;
    }
    res.json({ status: 'ok', message: 'Camera deleted successfully from database' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete camera from database: ' + err?.message });
  }
});

// --- Candidates ---
apiRouter.get('/candidates', async (req: Request, res: Response) => {
  const { activeOnly } = req.query;
  const candidates = db.getCandidates();
  if (activeOnly === 'true' || activeOnly === '1') {
    res.json(candidates.filter((c) => c.isCurrentlyTracked !== false));
  } else {
    res.json(candidates);
  }
});

apiRouter.get('/candidates/:id', async (req: Request, res: Response) => {
  const candidate = db.getCandidate(req.params.id);
  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }
  res.json(candidate);
});

apiRouter.put('/candidates/:id', async (req: Request, res: Response) => {
  try {
    const updated = await db.updateCandidate(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update candidate in database: ' + err?.message });
  }
});

apiRouter.post('/candidates/:id/clear-warning', async (req: Request, res: Response) => {
  try {
    const updated = await db.clearCandidateWarning(req.params.id);
    if (!updated) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }
    res.json({
      status: 'ok',
      message: `Warning cleared for candidate ${req.params.id}`,
      candidate: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear warning in database: ' + err?.message });
  }
});

apiRouter.delete('/candidates', async (req: Request, res: Response) => {
  try {
    await db.clearCandidates();
    res.json({ status: 'ok', message: 'All candidates deleted successfully from database.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear candidates from database: ' + err?.message });
  }
});

apiRouter.delete('/candidates/:id', async (req: Request, res: Response) => {
  try {
    const success = await db.removeCandidate(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }
    res.json({ status: 'ok', message: 'Candidate removed successfully from database' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to remove candidate from database: ' + err?.message });
  }
});

apiRouter.post(['/candidates/clear-all', '/candidates/reset-session', '/candidates/reset'], async (req: Request, res: Response) => {
  try {
    await db.clearAllSessionData();
    res.json({ status: 'ok', message: 'Exam session reset. All candidates and tracking cleared from database.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset exam session in database: ' + err?.message });
  }
});

// --- Data Export API ---
apiRouter.get('/export', (req: Request, res: Response) => {
  const format = (req.query.format as string) || 'json';
  const type = (req.query.type as string) || 'all';

  const candidates = db.getCandidates();
  const activities = db.getActivities({});
  const cameras = db.getCameras();
  const settings = db.getSettings();

  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="exam_session_export_${timestamp}.csv"`);

    const lines: string[] = [];
    if (type === 'all' || type === 'candidates') {
      lines.push('# === EXAM CANDIDATE ROSTER & SCORES ===');
      lines.push('Candidate P-ID,Student Name,Seat Number,Score (0-100),Warning Level,Warning Cleared,Tracked Status,First Seen,Last Seen,Notes');
      candidates.forEach((c) => {
        const pid = c.id || (c as any).pId || 'P-?';
        const name = (c.studentName || c.name || 'Unassigned').replace(/"/g, '""');
        const seat = (c.seatNumber || 'N/A').replace(/"/g, '""');
        const score = c.currentScore ?? c.score ?? 0;
        const level = c.warningLevel || 'normal';
        const cleared = c.warningCleared ? 'Yes' : 'No';
        const tracked = (c.isCurrentlyTracked || c.activeInFrame) ? 'Active' : 'Ended';
        const notes = (c.notes || '').replace(/"/g, '""');
        lines.push(`"${pid}","${name}","${seat}",${score},"${level}","${cleared}","${tracked}","${c.firstSeen || ''}","${c.lastSeen || ''}","${notes}"`);
      });
      lines.push('');
    }

    if (type === 'all' || type === 'activities') {
      lines.push('# === OBSERVED ACTIVITY AUDIT LOG ===');
      lines.push('Activity ID,Candidate P-ID,Camera,Activity Type,Details,Score Weight,Score After,Warning Level,Timestamp,Display Time');
      activities.forEach((a) => {
        const id = a.id;
        const pid = a.pId;
        const cam = (a.cameraName || a.cameraId || 'Cam-1').replace(/"/g, '""');
        const actType = a.activityType.replace(/"/g, '""');
        const details = (a.details || '').replace(/"/g, '""');
        const weight = a.scoreChange > 0 ? `+${a.scoreChange}` : `${a.scoreChange}`;
        lines.push(`"${id}","${pid}","${cam}","${actType}","${details}",${weight},${a.scoreAfter},"${a.warningLevel}","${a.timestamp || ''}","${a.timeDisplay || ''}"`);
      });
    }

    res.send(lines.join('\n'));
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="exam_session_report_${timestamp}.json"`);

  res.json({
    exportTimestamp: new Date().toISOString(),
    appName: settings.appName,
    summary: {
      totalCandidates: candidates.length,
      totalActivities: activities.length,
      highWarningCandidates: candidates.filter((c) => c.warningLevel === 'high').length,
    },
    cameras: type === 'all' ? cameras : undefined,
    candidates: (type === 'all' || type === 'candidates') ? candidates : undefined,
    activities: (type === 'all' || type === 'activities') ? activities : undefined,
  });
});

// --- Activities ---
apiRouter.get('/activities', (req: Request, res: Response) => {
  const { pId, activityType, warningLevel, cameraId, limit } = req.query;
  const activities = db.getActivities({
    pId: pId as string | undefined,
    activityType: activityType as string | undefined,
    warningLevel: warningLevel as string | undefined,
    cameraId: cameraId as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  });
  res.json(activities);
});

apiRouter.post('/activities/clear', async (req: Request, res: Response) => {
  try {
    await db.clearActivities();
    res.json({ status: 'ok', message: 'All activities cleared successfully from database.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear activities from database: ' + err?.message });
  }
});

apiRouter.delete('/activities', async (req: Request, res: Response) => {
  try {
    await db.clearActivities();
    res.json({ status: 'ok', message: 'All activities cleared successfully from database.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear activities from database: ' + err?.message });
  }
});

// Individual activity deletion endpoint
apiRouter.delete('/activities/:id', async (req: Request, res: Response) => {
  try {
    const success = await db.deleteActivity(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Activity record not found in database' });
      return;
    }
    res.json({ status: 'ok', message: 'Activity record deleted successfully from database' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete activity from database: ' + err?.message });
  }
});

apiRouter.post('/activities', async (req: Request, res: Response) => {
  try {
    const { pId, cameraId, activityType, details, scoreWeight } = req.body;
    if (!pId || !activityType) {
      res.status(400).json({ error: 'pId and activityType are required' });
      return;
    }
    const result = await db.recordActivity({
      pId,
      cameraId: cameraId || 'cam-1',
      activityType,
      details: details || `Recorded activity: ${activityType}`,
      scoreWeight: scoreWeight !== undefined ? Number(scoreWeight) : undefined,
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to record activity in database' });
  }
});

// --- Activity Types ---
apiRouter.get('/activity-types', (req: Request, res: Response) => {
  res.json(db.getActivityTypes());
});

apiRouter.post('/activity-types', async (req: Request, res: Response) => {
  try {
    const { name, description, scoreWeight, severity } = req.body;
    if (!name || scoreWeight === undefined) {
      res.status(400).json({ error: 'name and scoreWeight are required' });
      return;
    }
    const newType: ActivityTypeConfig = {
      id: `act-${Date.now()}`,
      name: String(name).trim(),
      description: description ? String(description).trim() : '',
      scoreWeight: Number(scoreWeight),
      severity: severity || 'medium',
    };
    const saved = await db.saveActivityType(newType);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save activity type: ' + err?.message });
  }
});

apiRouter.put('/activity-types/:id', async (req: Request, res: Response) => {
  try {
    const saved = await db.saveActivityType({
      id: req.params.id,
      ...req.body,
    });
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update activity type: ' + err?.message });
  }
});

apiRouter.delete('/activity-types/:id', async (req: Request, res: Response) => {
  try {
    const ok = await db.deleteActivityType(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Activity type not found' });
      return;
    }
    res.json({ status: 'ok', message: 'Activity type deleted' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete activity type: ' + err?.message });
  }
});

// --- Score Configuration ---
apiRouter.get('/scores/config', (req: Request, res: Response) => {
  res.json(db.getScoreConfig());
});

apiRouter.put('/scores/config', async (req: Request, res: Response) => {
  try {
    const { normalMax, warningMax, highWarningMin, highMin } = req.body;
    const updated = await db.updateScoreConfig({
      normalMax: normalMax !== undefined ? Number(normalMax) : undefined,
      warningMax: warningMax !== undefined ? Number(warningMax) : undefined,
      highWarningMin: (highWarningMin !== undefined ? Number(highWarningMin) : (highMin !== undefined ? Number(highMin) : undefined)),
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update score config in database: ' + err?.message });
  }
});

// Alias for thresholds endpoint
apiRouter.all(['/settings/thresholds', '/scores/thresholds'], async (req: Request, res: Response) => {
  if (req.method === 'GET') {
    const cfg = db.getScoreConfig();
    res.json({
      normalMax: cfg.normalMax,
      warningMax: cfg.warningMax,
      highMin: cfg.highWarningMin,
      highWarningMin: cfg.highWarningMin,
    });
  } else {
    try {
      const { normalMax, warningMax, highMin, highWarningMin } = req.body;
      const updated = await db.updateScoreConfig({
        normalMax: normalMax !== undefined ? Number(normalMax) : undefined,
        warningMax: warningMax !== undefined ? Number(warningMax) : undefined,
        highWarningMin: highWarningMin !== undefined ? Number(highWarningMin) : (highMin !== undefined ? Number(highMin) : undefined),
      });
      res.json({
        status: 'ok',
        normalMax: updated.normalMax,
        warningMax: updated.warningMax,
        highMin: updated.highWarningMin,
        highWarningMin: updated.highWarningMin,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update thresholds in database: ' + err?.message });
    }
  }
});

// --- Settings ---
apiRouter.get('/settings', (req: Request, res: Response) => {
  res.json(db.getSettings());
});

apiRouter.put('/settings', async (req: Request, res: Response) => {
  try {
    const updated = await db.updateSettings(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save settings to database: ' + err?.message });
  }
});

// --- Admin Authentication Endpoint (Zero Demo Credentials) ---
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const envAdminUser = process.env.ADMIN_USERNAME;
  const envAdminPass = process.env.ADMIN_PASSWORD;

  // Fail safely if server credentials are not configured in environment
  if (!envAdminUser || !envAdminUser.trim() || !envAdminPass || !envAdminPass.trim()) {
    res.status(500).json({
      authenticated: false,
      error: 'Server Authentication Error: ADMIN_USERNAME and ADMIN_PASSWORD environment variables are missing in server environment configuration.',
    });
    return;
  }

  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({
      authenticated: false,
      error: 'Username and password are required for administrator access.',
    });
    return;
  }

  // Timing-safe comparison to protect against side-channel timing attacks
  const isUsernameMatch = safeTimingCompare(String(username).trim(), envAdminUser.trim());
  const isPasswordMatch = safeTimingCompare(String(password), envAdminPass);

  if (isUsernameMatch && isPasswordMatch) {
    const token = `adm-token-${crypto.randomBytes(24).toString('hex')}`;
    res.json({
      authenticated: true,
      token,
      adminId: envAdminUser.trim(),
    });
  } else {
    res.status(401).json({
      authenticated: false,
      error: 'Invalid administrator username or password.',
    });
  }
});
