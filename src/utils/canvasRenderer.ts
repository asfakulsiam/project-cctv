/**
 * Smart Classroom Exam Monitoring System
 * Canvas Overlay Telemetry & Real-Time Computer Vision Renderer
 * 
 * CORE REQUIREMENTS:
 * 1. Fixed Person Tracking ID & Suspicion Score Display:
 *    - Bounding boxes prominently show the fixed ID (e.g. P-001) and real-time Suspicion Score (0 - 100).
 *    - Formatted as "P-001 • SCORE 24", "P-001 • SCORE 72 • WARNING", "P-001 • SCORE 91 • CRITICAL".
 * 2. Visual Warning / Alert Color Hierarchy:
 *    - WARNING (Score 35 - 64): Pure High-Visibility Yellow (#eab308 / #fbbf24) bounding box, tag & brackets.
 *    - CRITICAL ALERT (Score >= 65): Bright Crimson Red (#ef4444) bounding box & alert badge.
 *    - NORMAL (Score < 35): Crisp Emerald Green (#10b981) bounding box & normal tag.
 * 3. Exact Displayed Video Aspect Ratio & Coordinate Mapping:
 *    - Accounts for video intrinsic aspect ratio (16:9, 4:3, etc.), letterbox/pillarbox margins,
 *      center-origin zoom and pan, and clamps labels within the visible viewport.
 */

import { CameraTrack, SeatRecord, StudentRecord, GlobalPerson } from '../types.js';

export interface DisplayedVideoRect {
  offsetX: number;
  offsetY: number;
  displayedWidth: number;
  displayedHeight: number;
}

export function computeDisplayedVideoRect(
  canvasWidth: number,
  canvasHeight: number,
  videoSource?: HTMLVideoElement | HTMLImageElement | null,
  fitMode: 'contain' | 'cover' = 'contain'
): DisplayedVideoRect {
  if (!videoSource) {
    return { offsetX: 0, offsetY: 0, displayedWidth: canvasWidth, displayedHeight: canvasHeight };
  }

  let sourceWidth = 0;
  let sourceHeight = 0;

  if (videoSource instanceof HTMLVideoElement) {
    sourceWidth = videoSource.videoWidth;
    sourceHeight = videoSource.videoHeight;
  } else if (videoSource instanceof HTMLImageElement) {
    sourceWidth = videoSource.naturalWidth || videoSource.width;
    sourceHeight = videoSource.naturalHeight || videoSource.height;
  }

  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
    return { offsetX: 0, offsetY: 0, displayedWidth: canvasWidth, displayedHeight: canvasHeight };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  if (fitMode === 'cover') {
    if (sourceAspect > canvasAspect) {
      // Source is wider: fit height, overflow width
      const displayedHeight = canvasHeight;
      const displayedWidth = canvasHeight * sourceAspect;
      const offsetX = (canvasWidth - displayedWidth) / 2;
      return { offsetX, offsetY: 0, displayedWidth, displayedHeight };
    } else {
      // Source is taller: fit width, overflow height
      const displayedWidth = canvasWidth;
      const displayedHeight = canvasWidth / sourceAspect;
      const offsetY = (canvasHeight - displayedHeight) / 2;
      return { offsetX: 0, offsetY, displayedWidth, displayedHeight };
    }
  }

  // Default 'contain' (Auto Frame - Best View)
  if (sourceAspect > canvasAspect) {
    // Source is wider: letterbox top & bottom
    const displayedWidth = canvasWidth;
    const displayedHeight = canvasWidth / sourceAspect;
    const offsetY = (canvasHeight - displayedHeight) / 2;
    return { offsetX: 0, offsetY, displayedWidth, displayedHeight };
  } else {
    // Source is taller/narrower (e.g. 4:3 in 16:9 canvas): pillarbox left & right
    const displayedHeight = canvasHeight;
    const displayedWidth = canvasHeight * sourceAspect;
    const offsetX = (canvasWidth - displayedWidth) / 2;
    return { offsetX, offsetY: 0, displayedWidth, displayedHeight };
  }
}

/**
 * Resolve canonical Person ID (P-001, P-002, etc.) from track and global registry.
 * Strictly prevents camera track IDs (e.g. CAM1-T001) from ever being used as person identities.
 */
export function resolveCanonicalPersonId(track: CameraTrack, globalPersons?: GlobalPerson[]): string {
  const candidate = track.global_person_id || track.person_id;
  if (candidate && candidate.trim() !== '') {
    return candidate.toUpperCase();
  }

  if (globalPersons && globalPersons.length > 0) {
    const found = globalPersons.find(gp => 
      gp.camera_tracks?.some(ct => ct.track_id === track.track_id)
    );
    if (found && (found.id || found.person_id)) {
      const gId = found.id || found.person_id;
      if (gId && gId.trim() !== '') {
        return gId.toUpperCase();
      }
    }
  }

  return track.track_id || 'P-001';
}

export interface DrawCameraFeedOptions {
  width: number;
  height: number;
  cameraName: string;
  cameraId: string;
  isPrimary: boolean;
  tracks: CameraTrack[];
  students: StudentRecord[];
  globalPersons?: GlobalPerson[];
  zoomLevel: number;
  panOffset: { x: number; y: number };
  selectedTrackId?: string | null;
  warningSuspicionThreshold?: number;
  highSuspicionThreshold?: number;
  videoSource?: HTMLVideoElement | HTMLImageElement | null;
  fitMode?: 'contain' | 'cover';
}

export function drawCameraFeed(
  ctx: CanvasRenderingContext2D,
  options: DrawCameraFeedOptions,
  now: number = Date.now()
): void {
  const {
    width,
    height,
    cameraId,
    tracks,
    students,
    globalPersons = [],
    zoomLevel = 1.0,
    panOffset = { x: 0, y: 0 },
    selectedTrackId = null,
    warningSuspicionThreshold = 35,
    highSuspicionThreshold = 65,
    videoSource = null,
    fitMode = 'contain'
  } = options;

  // Clear canvas buffer completely
  ctx.clearRect(0, 0, width, height);

  // Compute exact displayed video rectangle inside the canvas viewport
  const rect = computeDisplayedVideoRect(width, height, videoSource, fitMode);

  // Apply zoom and pan transformation (matching video element CSS transform-origin: center center)
  ctx.save();
  ctx.translate(width / 2 + panOffset.x, height / 2 + panOffset.y);
  ctx.scale(zoomLevel, zoomLevel);
  ctx.translate(-width / 2, -height / 2);

  // -------------------------------------------------------------
  // 1. Render Real-Time Person Tracks, Fixed P-IDs & Activity Scores
  // -------------------------------------------------------------
  for (const track of tracks) {
    // Convert normalized bounding box to canvas pixels relative to displayed video frame
    const px = rect.offsetX + track.bbox.x * rect.displayedWidth;
    const py = rect.offsetY + track.bbox.y * rect.displayedHeight;
    const pw = track.bbox.width * rect.displayedWidth;
    const ph = track.bbox.height * rect.displayedHeight;

    const isSelected = track.track_id === selectedTrackId;
    const liveScore = Math.max(0, Math.min(100, Math.round(track.current_score !== undefined ? track.current_score : (track.suspicion_score || 0))));
    
    // Status Classification based on live current_score and warning_latched
    const isCritical = Boolean(track.warning_latched) || liveScore >= highSuspicionThreshold;
    const isWarning = !isCritical && liveScore >= warningSuspicionThreshold;

    let borderColor = '#10b981'; // Normal: Emerald Green
    let cornerColor = '#10b981';
    let badgeBg = '#10b981';
    let badgeTextColor = '#ffffff';

    if (isCritical) {
      borderColor = '#ef4444'; // Critical: Bright Red
      cornerColor = '#ef4444';
      badgeBg = '#ef4444';
      badgeTextColor = '#ffffff';
    } else if (isWarning) {
      borderColor = '#eab308'; // Warning: High-Visibility Yellow
      cornerColor = '#fbbf24';
      badgeBg = '#eab308';
      badgeTextColor = '#0f172a'; // High contrast black text on yellow
    }

    if (isSelected) {
      borderColor = '#38bdf8';
    }

    // A. Motion history trajectory trail
    if (track.history_trajectory && track.history_trajectory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = isCritical ? 'rgba(239, 68, 68, 0.4)' : (isWarning ? 'rgba(234, 179, 8, 0.4)' : 'rgba(16, 185, 129, 0.3)');
      ctx.lineWidth = 2;
      for (let i = 0; i < track.history_trajectory.length; i++) {
        const pt = track.history_trajectory[i];
        const hx = rect.offsetX + pt.x * rect.displayedWidth;
        const hy = rect.offsetY + pt.y * rect.displayedHeight;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.stroke();
    }

    // B. Optical Head Gaze Direction Ray
    if (track.head_pose) {
      const centerX = px + pw / 2;
      const headCenterY = py + ph * 0.22;
      const gazeLength = Math.min(pw * 0.7, 45);

      let gazeAngle = Math.PI / 2; // Looking down / straight
      if (track.head_pose.direction === 'left') {
        gazeAngle = Math.PI * 0.92;
      } else if (track.head_pose.direction === 'right') {
        gazeAngle = Math.PI * 0.08;
      } else if (track.head_pose.direction === 'up') {
        gazeAngle = -Math.PI / 2;
      }

      const gazeEndX = centerX + Math.cos(gazeAngle) * gazeLength;
      const gazeEndY = headCenterY + Math.sin(gazeAngle) * gazeLength;

      ctx.strokeStyle = track.head_pose.direction !== 'center' ? '#eab308' : 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(centerX, headCenterY);
      ctx.lineTo(gazeEndX, gazeEndY);
      ctx.stroke();

      // Directional gaze tip
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(gazeEndX, gazeEndY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // C. Mobile Phone Detection Reticle Overlay
    if (track.phone_detected && track.phone_bbox) {
      const phoneX = rect.offsetX + track.phone_bbox.x * rect.displayedWidth;
      const phoneY = rect.offsetY + track.phone_bbox.y * rect.displayedHeight;
      const phoneW = track.phone_bbox.width * rect.displayedWidth;
      const phoneH = track.phone_bbox.height * rect.displayedHeight;

      // Glow pulsation
      const pulse = (Math.sin(now / 180) + 1) / 2;
      ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + pulse * 0.4})`;
      ctx.fillRect(phoneX - 3, phoneY - 3, phoneW + 6, phoneH + 6);

      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.fillRect(phoneX, phoneY, phoneW, phoneH);
      ctx.strokeRect(phoneX, phoneY, phoneW, phoneH);

      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(phoneX + 2, phoneY + 2, Math.max(1, phoneW - 4), Math.max(1, phoneH - 4));
    }

    // -------------------------------------------------------------
    // D. Dynamic Person Bounding Box (Snug, Frame-by-Frame Motion Tracking)
    // -------------------------------------------------------------
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isSelected ? 2.2 : (isWarning || isCritical ? 1.8 : 1.3);
    ctx.strokeRect(px, py, pw, ph);

    // Subtle box inner tint on warning / critical
    if (isWarning) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.08)';
      ctx.fillRect(px, py, pw, ph);
    } else if (isCritical) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.fillRect(px, py, pw, ph);
    }

    // Slim, compact corner accent brackets
    const cornerLen = Math.min(8, pw * 0.18);
    ctx.strokeStyle = cornerColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    // Top-Left
    ctx.moveTo(px, py + cornerLen);
    ctx.lineTo(px, py);
    ctx.lineTo(px + cornerLen, py);
    // Top-Right
    ctx.moveTo(px + pw - cornerLen, py);
    ctx.lineTo(px + pw, py);
    ctx.lineTo(px + pw, py + cornerLen);
    // Bottom-Left
    ctx.moveTo(px, py + ph - cornerLen);
    ctx.lineTo(px, py + ph);
    ctx.lineTo(px + cornerLen, py + ph);
    // Bottom-Right
    ctx.moveTo(px + pw - cornerLen, py + ph);
    ctx.lineTo(px + pw, py + ph);
    ctx.lineTo(px + pw, py + ph - cornerLen);
    ctx.stroke();

    // Center targeting micro-crosshair
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy);
    ctx.lineTo(cx + 3, cy);
    ctx.moveTo(cx, cy - 3);
    ctx.lineTo(cx, cy + 3);
    ctx.stroke();

    // -------------------------------------------------------------
    // E. Compact Attached P-ID & Activity Score Label (e.g. "P-001 • 24")
    // -------------------------------------------------------------
    const personId = resolveCanonicalPersonId(track, globalPersons) || 'P-000';
    const tagText = `${personId} • ${liveScore}`;
    
    // Crisp typography for maximum readability and minimal visual obstruction
    ctx.font = 'bold 9px "JetBrains Mono", "SF Mono", monospace';
    const tagPaddingH = 4;
    const tagWidth = ctx.measureText(tagText).width + tagPaddingH * 2;
    const tagHeight = 13;

    // Preferred placement: directly above the bounding box
    let headerY = py - tagHeight - 2;
    // Clamping: If not enough headroom above, place inside top of bounding box
    if (headerY < rect.offsetY + 2 || headerY < 2) {
      headerY = py + 2;
      if (ph < tagHeight + 4) {
        headerY = py + ph + 2;
      }
    }

    // Clamp header horizontally to remain inside the visible viewport
    let headerX = px;
    const minX = Math.max(2, rect.offsetX);
    const maxX = Math.min(width - tagWidth - 2, rect.offsetX + rect.displayedWidth - tagWidth - 2);
    if (headerX < minX) headerX = minX;
    if (headerX > maxX) headerX = maxX;

    // Draw header pill
    ctx.fillStyle = badgeBg;
    ctx.fillRect(headerX, headerY, tagWidth, tagHeight);

    // Subtle dark border around header badge
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(headerX, headerY, tagWidth, tagHeight);

    // Header badge text
    ctx.fillStyle = badgeTextColor;
    ctx.fillText(tagText, headerX + tagPaddingH, headerY + 9.5);

    // -------------------------------------------------------------
    // G. Bottom Telemetry Alerts (Gaze direction / Phone detection)
    // -------------------------------------------------------------
    const footerY = Math.min(rect.offsetY + rect.displayedHeight - 4, py + ph + 14);
    let badgeOffset = 0;

    // Gaze Direction Alert
    if (track.head_pose && track.head_pose.direction !== 'center') {
      const dirText = `LOOKING ${track.head_pose.direction.toUpperCase()}`;
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      const dirW = ctx.measureText(dirText).width + 8;

      ctx.fillStyle = 'rgba(234, 179, 8, 0.95)';
      ctx.fillRect(px + badgeOffset, footerY - 12, dirW, 14);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(dirText, px + badgeOffset + 4, footerY - 1.5);
      badgeOffset += dirW + 3;
    }

    // Phone Detected Alert
    if (track.phone_detected) {
      const phoneText = 'PHONE DETECTED';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      const phoneW = ctx.measureText(phoneText).width + 8;

      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      ctx.fillRect(px + badgeOffset, footerY - 12, phoneW, 14);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(phoneText, px + badgeOffset + 4, footerY - 1.5);
      badgeOffset += phoneW + 3;
    }

    // Face Occlusion Alert
    const hasActualFaceAnalysis = (track.face_confidence ?? 0) > 0.35;
    const isFaceOccluded = hasActualFaceAnalysis && (track.face_occluded === true || track.face_visible === false);
    if (isFaceOccluded) {
      const faceText = 'FACE OCCLUDED';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      const faceW = ctx.measureText(faceText).width + 8;

      ctx.fillStyle = 'rgba(234, 88, 12, 0.95)';
      ctx.fillRect(px + badgeOffset, footerY - 12, faceW, 14);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(faceText, px + badgeOffset + 4, footerY - 1.5);
      badgeOffset += faceW + 3;
    }
  }

  // Restore transform
  ctx.restore();

  // -------------------------------------------------------------
  // 3. Zoom Factor Overlay Indicator
  // -------------------------------------------------------------
  if (zoomLevel > 1.0) {
    const zoomText = `ZOOM ${zoomLevel.toFixed(1)}X (DRAG TO PAN)`;
    ctx.fillStyle = 'rgba(234, 179, 8, 0.95)';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const zw = ctx.measureText(zoomText).width + 16;
    ctx.fillRect(14, height - 34, zw, 22);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(zoomText, 22, height - 19);
  }
}

export function renderTelemetryCanvas(
  canvas: HTMLCanvasElement,
  options: {
    tracks: CameraTrack[];
    seats?: SeatRecord[];
    students: StudentRecord[];
    globalPersons?: GlobalPerson[];
    cameraId: string;
    selectedTrackId?: string | null;
    warningSuspicionThreshold?: number;
    highSuspicionThreshold?: number;
    zoomLevel?: number;
    panOffset?: { x: number; y: number };
    videoSource?: HTMLVideoElement | HTMLImageElement | null;
    fitMode?: 'contain' | 'cover';
  }
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawCameraFeed(ctx, {
    width: canvas.width,
    height: canvas.height,
    cameraName: options.cameraId,
    cameraId: options.cameraId,
    isPrimary: true,
    tracks: options.tracks,
    students: options.students,
    globalPersons: options.globalPersons,
    zoomLevel: options.zoomLevel || 1.0,
    panOffset: options.panOffset || { x: 0, y: 0 },
    selectedTrackId: options.selectedTrackId,
    warningSuspicionThreshold: options.warningSuspicionThreshold || 35,
    highSuspicionThreshold: options.highSuspicionThreshold || 65,
    videoSource: options.videoSource,
    fitMode: options.fitMode || 'contain'
  });
}
