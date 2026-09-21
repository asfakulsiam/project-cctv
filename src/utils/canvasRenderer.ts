/**
 * Smart Classroom Exam Monitoring System
 * Canvas Overlay Telemetry & Real-Time Computer Vision Renderer
 * 
 * CORE REQUIREMENTS:
 * 1. Fixed Person Tracking ID & Suspicion Score Display:
 *    - Bounding boxes prominently show the fixed ID (e.g. CAM1-S001) and real-time Suspicion Score (0 - 100).
 * 2. Visual Warning / Alert Color Hierarchy:
 *    - WARNING (Score 35 - 64): Pure High-Visibility Yellow (#eab308 / #fbbf24) bounding box, tag & brackets.
 *    - CRITICAL ALERT (Score >= 65): Bright Crimson Red (#ef4444) bounding box & alert badge.
 *    - NORMAL (Score < 35): Crisp Emerald Green (#10b981) bounding box & normal tag.
 * 3. Optical Gaze Vector & Behavior Overlay:
 *    - Renders head orientation vector, phone detection reticle, and student identification.
 */

import { CameraTrack, SeatRecord, StudentRecord } from '../types.js';
import { getTrackVisualState, VISUAL_STATE_CONFIG } from './visualState.js';

export interface DrawCameraFeedOptions {
  width: number;
  height: number;
  cameraName: string;
  cameraId: string;
  isPrimary: boolean;
  tracks: CameraTrack[];
  seats?: SeatRecord[];
  students: StudentRecord[];
  zoomLevel: number;
  panOffset: { x: number; y: number };
  selectedTrackId?: string | null;
  highSuspicionThreshold: number;
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
    seats = [],
    students,
    zoomLevel = 1.0,
    panOffset = { x: 0, y: 0 },
    selectedTrackId = null,
    highSuspicionThreshold = 65
  } = options;

  // Clear canvas buffer completely
  ctx.clearRect(0, 0, width, height);

  // Apply zoom and pan transformation (matching video player)
  ctx.save();
  ctx.translate(panOffset.x, panOffset.y);
  ctx.scale(zoomLevel, zoomLevel);

  // -------------------------------------------------------------
  // 1. Render Configured Seat Grid & Zones
  // -------------------------------------------------------------
  for (const seat of seats) {
    const region = seat.camera_regions?.[cameraId];
    if (!region) continue;

    const sx = region.x * width;
    const sy = region.y * height;
    const sw = region.width * width;
    const sh = region.height * height;

    // Subtle seat bounding perimeter
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);

    // Seat label pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.fillRect(sx + 2, sy + 2, 60, 14);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    const label = seat.seat_number || seat.seat_label || `S-${seat.id}`;
    ctx.fillText(`SEAT ${label}`, sx + 6, sy + 12);
  }

  // -------------------------------------------------------------
  // 2. Render Real-Time Person Tracks, Fixed IDs & Suspicion Scores
  // -------------------------------------------------------------
  for (const track of tracks) {
    // Convert normalized bounding box to canvas pixels
    const px = track.bbox.x * width;
    const py = track.bbox.y * height;
    const pw = track.bbox.width * width;
    const ph = track.bbox.height * height;

    const isSelected = track.track_id === selectedTrackId;
    const score = Math.max(0, Math.min(100, Math.round(track.suspicion_score || 0)));
    
    // Status Classification:
    // Warning: 35 <= score < highSuspicionThreshold (turns box and badges YELLOW)
    // Critical: score >= highSuspicionThreshold (turns box and badges RED)
    // Normal: score < 35 (turns box and badges GREEN/EMERALD)
    const isCritical = score >= highSuspicionThreshold;
    const isWarning = score >= 35 && !isCritical;

    let borderColor = '#10b981'; // Normal: Emerald Green
    let cornerColor = '#10b981';
    let badgeBg = '#10b981';
    let badgeTextColor = '#ffffff';
    let statusLabel = 'NORMAL';

    if (isCritical) {
      borderColor = '#ef4444'; // Critical: Bright Red
      cornerColor = '#ef4444';
      badgeBg = '#ef4444';
      badgeTextColor = '#ffffff';
      statusLabel = 'CRITICAL ALERT';
    } else if (isWarning) {
      borderColor = '#eab308'; // Warning: High-Visibility Yellow
      cornerColor = '#fbbf24';
      badgeBg = '#eab308';
      badgeTextColor = '#0f172a'; // High contrast black text on yellow
      statusLabel = 'WARNING';
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
        const hx = pt.x * width;
        const hy = pt.y * height;
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
    if (track.phone_detected) {
      const phoneX = px + pw * 0.6;
      const phoneY = py + ph * 0.55;
      const phoneW = pw * 0.24;
      const phoneH = ph * 0.22;

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
      ctx.fillRect(phoneX + 2, phoneY + 2, phoneW - 4, phoneH - 4);
    }

    // -------------------------------------------------------------
    // D. Dynamic Person Bounding Box (Frame-by-Frame Motion Tracking)
    // Clearly encloses the student so ID ownership is instant and unambiguous
    // -------------------------------------------------------------
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isSelected ? 2.8 : (isWarning || isCritical ? 2.2 : 1.6);
    ctx.strokeRect(px, py, pw, ph);

    // Subtle box inner tint on warning / critical
    if (isWarning) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.08)';
      ctx.fillRect(px, py, pw, ph);
    } else if (isCritical) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.fillRect(px, py, pw, ph);
    }

    // Corner accent brackets for crisp surveillance focus
    const cornerLen = Math.min(14, pw * 0.2);
    ctx.strokeStyle = cornerColor;
    ctx.lineWidth = 2.5;
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
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();

    // -------------------------------------------------------------
    // E. Compact, Non-Blocking ID & Score Header Tag
    // (Small, sleek, and moves frame-by-frame on top of the bounding box)
    // -------------------------------------------------------------
    const student = students.find(s => s.id === track.associated_student_id);
    const studentIdText = student?.student_id_number ? ` [${student.student_id_number}]` : '';
    const statusPrefix = isCritical ? '🚨 ' : (isWarning ? '⚠️ ' : '');
    const tagText = `${statusPrefix}${track.track_id}${studentIdText} • SCORE: ${score}`;
    
    // Compact font to avoid blocking camera views
    ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
    const tagWidth = ctx.measureText(tagText).width + 10;
    const tagHeight = 16;

    // Header Y position (clamped so it is never clipped by top canvas border)
    const headerY = py >= tagHeight + 3 ? py - tagHeight - 2 : py + 2;

    // Compact Header Badge
    ctx.fillStyle = badgeBg;
    ctx.fillRect(px, headerY, tagWidth, tagHeight);

    // Subtle dark border around header badge
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, headerY, tagWidth, tagHeight);

    // Header badge text
    ctx.fillStyle = badgeTextColor;
    ctx.fillText(tagText, px + 5, headerY + 11.5);

    // -------------------------------------------------------------
    // G. Bottom Telemetry Alerts (Only rendered when active alerts occur)
    // -------------------------------------------------------------
    const footerY = Math.min(height - 8, py + ph + 16);
    let badgeOffset = 0;

    // Gaze Direction Alert
    if (track.head_pose && track.head_pose.direction !== 'center') {
      const dirText = `LOOKING ${track.head_pose.direction.toUpperCase()}`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const dirW = ctx.measureText(dirText).width + 10;

      ctx.fillStyle = 'rgba(234, 179, 8, 0.95)';
      ctx.fillRect(px + badgeOffset, footerY - 14, dirW, 18);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(dirText, px + badgeOffset + 5, footerY - 1);
      badgeOffset += dirW + 4;
    }

    // Phone Detected Alert
    if (track.phone_detected) {
      const phoneText = 'PHONE DETECTED';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const phoneW = ctx.measureText(phoneText).width + 10;

      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      ctx.fillRect(px + badgeOffset, footerY - 14, phoneW, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(phoneText, px + badgeOffset + 5, footerY - 1);
      badgeOffset += phoneW + 4;
    }

    // Face Occlusion Alert
    if (!track.face_visible) {
      const faceText = 'FACE OCCLUDED';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const faceW = ctx.measureText(faceText).width + 10;

      ctx.fillStyle = 'rgba(234, 88, 12, 0.95)';
      ctx.fillRect(px + badgeOffset, footerY - 14, faceW, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(faceText, px + badgeOffset + 5, footerY - 1);
      badgeOffset += faceW + 4;
    }

    // Cross-Camera Best View Arbitration Badge
    if (student && student.active_observations && student.active_observations.length > 0) {
      const myObs = student.active_observations.find(o => o.camera_id === cameraId);
      const isBest = myObs ? myObs.is_best_view : false;
      const bestObs = student.active_observations.find(o => o.is_best_view);

      const bestText = isBest
        ? `★ BEST VIEW (${Math.round(myObs?.quality || 92)}%)`
        : `BEST: ${bestObs ? bestObs.camera_id.toUpperCase().replace('-', ' ') : 'OTHER'}`;

      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const bestW = ctx.measureText(bestText).width + 10;
      ctx.fillStyle = isBest ? 'rgba(16, 185, 129, 0.95)' : 'rgba(51, 65, 85, 0.88)';
      ctx.fillRect(px + badgeOffset, footerY - 14, bestW, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(bestText, px + badgeOffset + 5, footerY - 1);
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
    seats: SeatRecord[];
    students: StudentRecord[];
    cameraId: string;
    selectedTrackId?: string | null;
    highSuspicionThreshold?: number;
    zoomLevel?: number;
    panOffset?: { x: number; y: number };
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
    seats: options.seats,
    students: options.students,
    zoomLevel: options.zoomLevel || 1.0,
    panOffset: options.panOffset || { x: 0, y: 0 },
    selectedTrackId: options.selectedTrackId,
    highSuspicionThreshold: options.highSuspicionThreshold || 65
  });
}
