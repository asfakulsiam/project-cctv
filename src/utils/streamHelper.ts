/**
 * Smart Classroom Exam Monitoring System
 * Universal Camera Stream URL Resolver
 * 
 * Supports:
 * - Google Drive shared video links (direct streaming + proxy)
 * - Mobile IP Webcam (MJPEG /video endpoints)
 * - Local & USB Webcams (getUserMedia)
 * - HTTP / HTTPS MP4 & HLS video streams
 */

import { CameraConfig } from '../types.js';

export function extractGoogleDriveId(url?: string): string | null {
  if (!url) return null;
  const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match1) return match1[1];
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (match2) return match2[1];
  const match3 = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match3) return match3[1];
  return null;
}

export type StreamKind = 'gdrive' | 'webcam' | 'mjpeg' | 'video' | 'offline';

export interface StreamResolution {
  kind: StreamKind;
  streamUrl: string;
  isProxy: boolean;
  label: string;
}

export function resolveCameraStream(camera?: CameraConfig | null): StreamResolution {
  if (!camera || !camera.enabled || camera.status === 'offline') {
    return {
      kind: 'offline',
      streamUrl: '',
      isProxy: false,
      label: 'Camera Offline'
    };
  }

  const rawUrl = (camera.source_url || '').trim();
  const sourceType = (camera.source_type || '').toLowerCase();

  // 1. Local Device Webcam
  if (sourceType === 'webcam' || rawUrl === 'webcam:default' || rawUrl.startsWith('webcam:')) {
    return {
      kind: 'webcam',
      streamUrl: 'webcam:local',
      isProxy: false,
      label: 'Local Hardware Webcam'
    };
  }

  // 2. Google Drive Video Link
  const gdriveId = extractGoogleDriveId(rawUrl);
  if (gdriveId) {
    // Route through our high-performance backend proxy with Range support and CORS headers
    return {
      kind: 'gdrive',
      streamUrl: `/api/proxy/gdrive/${gdriveId}`,
      isProxy: true,
      label: 'Google Drive Video Stream'
    };
  }

  // 3. Mobile IP Webcam (e.g. IP Webcam app on Android/iOS, often :8080/video or :8080)
  if (sourceType === 'ip_webcam' || rawUrl.includes(':8080')) {
    let normalized = rawUrl;
    if (/^https?:\/\/[^/]+:8080\/?$/i.test(normalized)) {
      normalized = normalized.replace(/\/?$/, '/video');
    }
    // Route through backend proxy to avoid mixed-content (HTTP vs HTTPS) or CORS blocking
    return {
      kind: 'mjpeg',
      streamUrl: `/api/proxy/stream?url=${encodeURIComponent(normalized)}`,
      isProxy: true,
      label: 'Mobile IP Webcam Stream'
    };
  }

  // 4. Direct MP4 / WebM video file link
  if (rawUrl.match(/\.(mp4|webm|ogv|mov)(\?.*)?$/i)) {
    return {
      kind: 'video',
      streamUrl: rawUrl.startsWith('http') ? `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}` : rawUrl,
      isProxy: rawUrl.startsWith('http'),
      label: 'Direct Video Stream (MP4)'
    };
  }

  // 5. General HTTP stream
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return {
      kind: 'video',
      streamUrl: `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}`,
      isProxy: true,
      label: 'Network Video Feed'
    };
  }

  return {
    kind: 'video',
    streamUrl: rawUrl,
    isProxy: false,
    label: camera.source_type.toUpperCase()
  };
}
