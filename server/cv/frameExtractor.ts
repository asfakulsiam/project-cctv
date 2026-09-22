import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export class CameraFrameExtractor {
  private cameraId: string;
  private sourceUrl: string;
  private process: ChildProcess | null = null;
  private isRunning = false;
  private framesReceived = 0;
  private lastFrameTimestamp = 0;
  private currentFps = 0;
  private lastError: string | null = null;
  private frameCountWindow = 0;
  private lastFpsTime = Date.now();
  private onFrame: (frame: any) => void;

  constructor(cameraId: string, sourceUrl: string, onFrame: (frame: any) => void) {
    this.cameraId = cameraId;
    this.sourceUrl = sourceUrl;
    this.onFrame = onFrame;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.spawnFFmpeg();
  }

  private resolveInputUrl(): string {
    if (!this.sourceUrl) return '';
    const port = Number(process.env.PORT) || 3000;

    // 1. Resilient local sample video
    if (this.sourceUrl === '/api/video/sample' || this.sourceUrl === '/sample_cctv.mp4' || this.sourceUrl.includes('sample_cctv.mp4') || this.sourceUrl.includes('classroom.mp4')) {
      return path.join(process.cwd(), 'public', 'sample_cctv.mp4');
    }

    // 2. Google Drive video link -> route through local backend proxy
    if (this.sourceUrl.includes('drive.google.com') || this.sourceUrl.includes('drive.usercontent.google.com')) {
      const match = this.sourceUrl.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/) ||
                    this.sourceUrl.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
                    this.sourceUrl.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
      if (match && match[1]) {
        return `http://127.0.0.1:${port}/api/proxy/gdrive/${match[1]}`;
      }
    }

    // 3. API Relative endpoint -> attach local server base URL
    if (this.sourceUrl.startsWith('/api/')) {
      return `http://127.0.0.1:${port}${this.sourceUrl}`;
    }

    // 4. Local relative static file
    if (this.sourceUrl.startsWith('/') && !this.sourceUrl.startsWith('/api/')) {
      const localPath = path.join(process.cwd(), 'public', this.sourceUrl);
      if (fs.existsSync(localPath)) {
        return localPath;
      }
    }

    return this.sourceUrl;
  }

  private spawnFFmpeg(): void {
    const inputPath = this.resolveInputUrl();
    if (!inputPath) {
      this.lastError = 'Invalid source URL';
      this.isRunning = false;
      return;
    }

    // Check if local file exists if it's a local path
    if (!inputPath.startsWith('http://') && !inputPath.startsWith('https://') && !fs.existsSync(inputPath)) {
      this.lastError = `Video file not found: ${inputPath}`;
      this.isRunning = false;
      return;
    }

    const args = [
      '-re',
      '-stream_loop', '-1',
      '-i', inputPath,
      '-vf', 'fps=5,scale=640:360',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1'
    ];

    try {
      this.process = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let buffer = Buffer.alloc(0);

      this.process.stdout?.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        
        while (true) {
          const soi = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
          if (soi === -1) {
            if (buffer.length > 65536) buffer = buffer.slice(buffer.length - 32768);
            break;
          }
          if (soi > 0) {
            buffer = buffer.slice(soi);
          }
          const eoi = buffer.indexOf(Buffer.from([0xFF, 0xD9]), 2);
          if (eoi === -1) {
            break;
          }

          const jpegFrame = buffer.slice(0, eoi + 2);
          buffer = buffer.slice(eoi + 2);

          const now = Date.now();
          this.framesReceived++;
          this.lastFrameTimestamp = now;
          this.lastError = null;

          this.frameCountWindow++;
          const elapsed = now - this.lastFpsTime;
          if (elapsed >= 1000) {
            this.currentFps = Math.round((this.frameCountWindow * 1000) / elapsed);
            this.frameCountWindow = 0;
            this.lastFpsTime = now;
          }

          this.onFrame({
            camera_id: this.cameraId,
            timestamp: now,
            buffer: jpegFrame,
            detections: []
          });
        }
      });

      this.process.stderr?.on('data', (data) => {
        const str = data.toString();
        if (str.includes('Error') || str.includes('Invalid')) {
          this.lastError = str.trim();
        }
      });

      this.process.on('close', (code) => {
        if (this.isRunning && code !== 0) {
          this.lastError = `FFmpeg exited with code ${code}`;
          setTimeout(() => {
            if (this.isRunning) this.spawnFFmpeg();
          }, 3000);
        }
      });

      this.process.on('error', (err) => {
        this.lastError = err.message;
      });
    } catch (err: any) {
      this.lastError = err.message;
      this.isRunning = false;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.process) {
      try {
        this.process.kill('SIGKILL');
      } catch {}
      this.process = null;
    }
  }

  public getDiagnostics() {
    const isReceiving = this.lastFrameTimestamp > 0 && (Date.now() - this.lastFrameTimestamp) <= 3000;
    return {
      camera_id: this.cameraId,
      source_url: this.sourceUrl,
      source_status: this.isRunning && isReceiving ? 'playing' : (this.lastError ? 'error' : 'idle'),
      media_connected: isReceiving,
      frames_received: this.framesReceived,
      last_frame_timestamp: this.lastFrameTimestamp,
      processing_fps: isReceiving ? this.currentFps : 0,
      last_error: this.lastError
    };
  }
}
