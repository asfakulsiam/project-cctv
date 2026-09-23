/**
 * server.ts - Application Entry Point & Express Web Server
 * Initializes the Express HTTP server, mounts static file routes (/uploads, /public),
 * serves the Vite SPA frontend in development/production, and launches the optional Python CV worker process.
 */
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import cors from 'cors';
import { apiRouter } from './server/routes.js';
import { cvClient } from './server/cvClient.js';

let pythonWorkerProcess: ChildProcess | null = null;

function ensurePythonWorker() {
  if (process.env.AUTO_START_CV === 'false') {
    return;
  }

  const scriptPath = path.join(process.cwd(), 'cv_service', 'main.py');
  if (!fs.existsSync(scriptPath)) {
    return;
  }

  // Look for python executable in common virtualenvs, custom env var, or system PATH
  const candidates = [
    process.env.PYTHON_PATH,
    path.join(process.cwd(), '.venv', 'bin', 'python'),
    path.join(process.cwd(), '.venv', 'bin', 'python3'),
    path.join(process.cwd(), '.venv', 'Scripts', 'python.exe'),
    path.join(process.cwd(), 'venv', 'bin', 'python'),
    path.join(process.cwd(), 'venv', 'bin', 'python3'),
    path.join(process.cwd(), 'venv', 'Scripts', 'python.exe'),
    '/opt/cv_venv/bin/python3',
  ].filter(Boolean) as string[];

  let pythonExecutable: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      pythonExecutable = p;
      break;
    }
  }

  // If a virtualenv was found or explicitly requested via AUTO_START_CV=true
  if (pythonExecutable || process.env.AUTO_START_CV === 'true') {
    const execPath = pythonExecutable || 'python3';
    try {
      console.log(`[Worker] Starting Python CV microservice with ${execPath}...`);
      pythonWorkerProcess = spawn(execPath, [scriptPath], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
        stdio: 'inherit',
      });
      pythonWorkerProcess.on('error', (err) => {
        console.warn(`[Worker] Python worker not available (${err.message}). Using client-side detection engine.`);
      });
      pythonWorkerProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.log(`[Worker] Python CV worker exited (code ${code}). Client-side detection active.`);
        }
        pythonWorkerProcess = null;
      });
    } catch (e: any) {
      console.warn('[Worker] Python worker launch skipped:', e?.message);
    }
  }
}

// Clean up worker on process exit
function cleanupWorker() {
  if (pythonWorkerProcess && !pythonWorkerProcess.killed) {
    try {
      pythonWorkerProcess.kill();
    } catch (_) {}
    pythonWorkerProcess = null;
  }
}

process.on('SIGINT', () => {
  cleanupWorker();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanupWorker();
  process.exit(0);
});

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Middlewares
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Static assets (like sample videos in /public/assets)
  const publicDir = path.join(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // Static uploads directory
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // Mount API router
  app.use('/api', apiRouter);

  // Background Python CV worker initialization (if custom env configured)
  ensurePythonWorker();

  // Vite middleware for dev or static serving for prod
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Exam Hall Monitoring Assistant running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Server] Fatal startup error:', err);
});
