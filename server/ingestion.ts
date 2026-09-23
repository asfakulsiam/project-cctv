/**
 * server/ingestion.ts - Universal Video Ingestion & Stream Testing Module
 * Resolves cloud video links (Google Drive, S3, Dropbox) and stream protocols (RTSP, HLS, MJPEG),
 * providing extractFrames() via ffmpeg and testSourceConnection() for verification.
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { extractGoogleDriveFileId, parseCloudVideoLink } from '../src/utils/cloudVideoHandler.js';
import { resolveGoogleDriveDirectUrl } from './cloudStream.js';

/**
 * Universal Video Source Resolver
 * 
 * Takes any raw sourceUrl (Google Drive, RTSP, HLS, Cloudinary, S3, Dropbox, local file)
 * and resolves it into a streamable URL that browser players or ffmpeg can consume.
 */
export function resolveSourceUrl(sourceUrl: string, username?: string, password?: string): string {
  if (!sourceUrl) return '';
  let url = sourceUrl.trim();

  // If already resolved to cloud stream proxy, return as is
  if (url.startsWith('/api/cloud-stream') || url.startsWith('api/cloud-stream')) {
    return url.startsWith('/') ? url : `/${url}`;
  }

  // Handle embedded username / password for RTSP or HTTP streams if specified separately
  if (username && password) {
    if (url.startsWith('rtsp://') && !url.includes('@')) {
      url = url.replace('rtsp://', `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`);
    } else if (url.startsWith('http://') && !url.includes('@')) {
      url = url.replace('http://', `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`);
    } else if (url.startsWith('https://') && !url.includes('@')) {
      url = url.replace('https://', `https://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`);
    }
  }

  // Google Drive Share Page Resolver -> Route through /api/cloud-stream proxy
  const driveId = extractGoogleDriveFileId(url);
  if (driveId) {
    return `/api/cloud-stream?fileId=${driveId}`;
  }

  // Other Cloud Video Link Providers (Dropbox, OneDrive, Box, GitHub)
  const cloudInfo = parseCloudVideoLink(url);
  if (cloudInfo.isCloud && cloudInfo.playableUrl) {
    return cloudInfo.playableUrl;
  }

  // Local uploaded or static asset paths (/uploads/..., /assets/...)
  if (url.startsWith('/assets/') || url.startsWith('assets/')) {
    const relativePath = url.startsWith('/') ? url.slice(1) : url;
    const publicPath = path.join(process.cwd(), 'public', relativePath);
    if (fs.existsSync(publicPath)) {
      return publicPath;
    }
  }

  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    const relativePath = url.startsWith('/') ? url.slice(1) : url;
    const absolutePath = path.join(process.cwd(), relativePath);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  // Direct link pass-through
  return url;
}

/**
 * Universal Frame Extractor using ffmpeg.
 */
export function extractFrames(sourceUrl: string) {
  const resolvedUrl = resolveSourceUrl(sourceUrl);
  const args = [
    '-i', resolvedUrl,
    '-vf', 'fps=8,scale=960:-1',
    '-q:v', '4',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-'
  ];

  return spawn('ffmpeg', args);
}

/**
 * Real Connection & Frame Extraction Test
 * Tests connectivity for Cloud URLs, RTSP, and uploaded video files.
 */
export async function testSourceConnection(
  rawUrl: string,
  username?: string,
  password?: string
): Promise<{ success: boolean; message: string; resolvedUrl: string; bytesCaptured?: number }> {
  if (!rawUrl || !rawUrl.trim()) {
    return {
      success: false,
      message: 'Source URL or file path cannot be empty.',
      resolvedUrl: '',
    };
  }

  const cleanUrl = rawUrl.trim();
  const driveId = extractGoogleDriveFileId(cleanUrl);
  const cloudInfo = parseCloudVideoLink(cleanUrl);
  const resolvedUrl = resolveSourceUrl(cleanUrl, username, password);

  // 1. Google Drive Special Handling: Direct Stream Validation
  if (driveId) {
    try {
      const directUrl = await resolveGoogleDriveDirectUrl(driveId);
      const testRes = await fetch(directUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });

      if (testRes.ok || testRes.status === 206) {
        const contentLength = testRes.headers.get('content-length');
        const sizeMb = contentLength ? (parseInt(contentLength, 10) / (1024 * 1024)).toFixed(1) : 'unknown';
        const contentType = testRes.headers.get('content-type') || 'video/mp4';

        return {
          success: true,
          message: `Google Drive video connected successfully! (${sizeMb} MB ${contentType} ready for playback)`,
          resolvedUrl,
          bytesCaptured: contentLength ? parseInt(contentLength, 10) : undefined,
        };
      } else {
        return {
          success: false,
          message: `Google Drive stream returned HTTP status ${testRes.status}. Ensure link sharing is set to "Anyone with the link".`,
          resolvedUrl,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to resolve Google Drive stream: ${err?.message || err}`,
        resolvedUrl,
      };
    }
  }

  // 2. Generic Cloud URLs (Dropbox, Box, OneDrive)
  if (cloudInfo.isCloud && cloudInfo.directDownloadUrl) {
    try {
      const testRes = await fetch(cloudInfo.directDownloadUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });

      if (testRes.ok || testRes.status === 206) {
        const contentLength = testRes.headers.get('content-length');
        const sizeMb = contentLength ? (parseInt(contentLength, 10) / (1024 * 1024)).toFixed(1) : 'unknown';

        return {
          success: true,
          message: `${cloudInfo.providerName} stream connected successfully! (${sizeMb} MB)`,
          resolvedUrl,
        };
      }
    } catch (e: any) {
      // Continue to ffmpeg fallback
    }
  }

  // 3. Local Files and RTSP streams via ffmpeg
  return new Promise((resolve) => {
    const targetUrl = (resolvedUrl.startsWith('/uploads/') || resolvedUrl.startsWith('/assets/'))
      ? path.join(process.cwd(), resolvedUrl.startsWith('/') ? resolvedUrl.slice(1) : resolvedUrl)
      : resolvedUrl;

    const args = [
      '-ss', '00:00:00',
      '-i', targetUrl,
      '-vframes', '1',
      '-vf', 'scale=960:-1',
      '-q:v', '4',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-'
    ];

    const proc = spawn('ffmpeg', args);
    let frameBuffer = Buffer.alloc(0);
    let stderrText = '';
    let completed = false;

    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        resolve({
          success: false,
          message: `Connection timeout (8s): Unable to fetch frame from "${resolvedUrl}". Please verify stream availability.`,
          resolvedUrl,
        });
      }
    }, 8000);

    proc.stdout.on('data', (chunk: Buffer) => {
      frameBuffer = Buffer.concat([frameBuffer, chunk]);
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderrText += data.toString();
    });

    proc.on('close', (code) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);

      if (code === 0 && frameBuffer.length > 0) {
        resolve({
          success: true,
          message: `Connected successfully! (Captured 1 test frame: ${(frameBuffer.length / 1024).toFixed(1)} KB)`,
          resolvedUrl,
          bytesCaptured: frameBuffer.length,
        });
      } else {
        const errorDetail = stderrText.trim() || `ffmpeg exited with code ${code}`;
        const filteredLines = errorDetail
          .split('\n')
          .filter((l) =>
            l.includes('Error') ||
            l.includes('Failed') ||
            l.includes('Invalid') ||
            l.includes('HTTP error') ||
            l.includes('Server returned') ||
            l.includes('Connection refused') ||
            l.includes('404') ||
            l.includes('403')
          );

        const summary = filteredLines.length > 0 ? filteredLines.join('; ') : errorDetail.slice(-250);

        resolve({
          success: false,
          message: `Connection Failed: ${summary}`,
          resolvedUrl,
        });
      }
    });

    proc.on('error', (err) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        message: `Pipeline Error: ${err.message}`,
        resolvedUrl,
      });
    });
  });
}
