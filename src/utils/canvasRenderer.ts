/**
 * Smart Classroom Exam Monitoring System
 * Live Computer Vision Canvas Renderer
 * 
 * Draws high-resolution simulated video frames and live CV overlay graphics:
 * Bounding boxes, camera-safe tracking IDs (CAM1-S001), head vectors,
 * suspicion metrics, face landmarks, and phone alerts.
 */

import { CameraTrack, StudentRecord } from '../types.js';

interface RenderOptions {
  width: number;
  height: number;
  cameraName: string;
  cameraId: string;
  isPrimary: boolean;
  tracks: CameraTrack[];
  students: StudentRecord[];
  zoomLevel: number;
  panOffset: { x: number; y: number };
  selectedTrackId: string | null;
  highSuspicionThreshold: number;
}

export function drawCameraFeed(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions,
  now: number
) {
  const { width, height, cameraName, cameraId, tracks, students, zoomLevel, panOffset, selectedTrackId, highSuspicionThreshold } = options;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Apply Zoom and Pan transform
  ctx.translate(panOffset.x, panOffset.y);
  ctx.scale(zoomLevel, zoomLevel);

  // -------------------------------------------------------------
  // 1. Draw Simulated Classroom Environment (Desks, Floor, Lighting)
  // -------------------------------------------------------------
  // Ambient floor tone
  const gradFloor = ctx.createLinearGradient(0, 0, 0, height);
  gradFloor.addColorStop(0, '#0f172a'); // slate-900
  gradFloor.addColorStop(1, '#020617'); // slate-950
  ctx.fillStyle = gradFloor;
  ctx.fillRect(0, 0, width, height);

  // Perspective floor tiles / grid
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.25)'; // slate-700
  ctx.lineWidth = 1;
  const numGridLines = 12;
  for (let i = 0; i <= numGridLines; i++) {
    const y = (height * 0.25) + (i * (height * 0.75) / numGridLines);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Center optical crosshair reticle
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)'; // cyan-500/25
  ctx.lineWidth = 1;
  const centerX = width / 2;
  const centerY = height / 2;
  const reticleSize = 16;
  ctx.beginPath();
  ctx.moveTo(centerX - reticleSize, centerY);
  ctx.lineTo(centerX + reticleSize, centerY);
  ctx.moveTo(centerX, centerY - reticleSize);
  ctx.lineTo(centerX, centerY + reticleSize);
  ctx.stroke();

  // Corner viewfinder brackets
  const bracketLen = 24;
  const bracketPadding = 20;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'; // slate-400/30
  ctx.lineWidth = 1.5;

  // Top-Left Bracket
  ctx.beginPath();
  ctx.moveTo(bracketPadding, bracketPadding + bracketLen);
  ctx.lineTo(bracketPadding, bracketPadding);
  ctx.lineTo(bracketPadding + bracketLen, bracketPadding);
  ctx.stroke();

  // Top-Right Bracket
  ctx.beginPath();
  ctx.moveTo(width - bracketPadding - bracketLen, bracketPadding);
  ctx.lineTo(width - bracketPadding, bracketPadding);
  ctx.lineTo(width - bracketPadding, bracketPadding + bracketLen);
  ctx.stroke();

  // Bottom-Left Bracket
  ctx.beginPath();
  ctx.moveTo(bracketPadding, height - bracketPadding - bracketLen);
  ctx.lineTo(bracketPadding, height - bracketPadding);
  ctx.lineTo(bracketPadding + bracketLen, height - bracketPadding);
  ctx.stroke();

  // Bottom-Right Bracket
  ctx.beginPath();
  ctx.moveTo(width - bracketPadding - bracketLen, height - bracketPadding);
  ctx.lineTo(width - bracketPadding, height - bracketPadding);
  ctx.lineTo(width - bracketPadding, height - bracketPadding - bracketLen);
  ctx.stroke();

  // Optical HUD Overlays: Camera Label & Telemetry
  ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText(`CH: ${cameraName.toUpperCase()}`, bracketPadding + 6, bracketPadding + 16);
  ctx.fillText(`FOV: LIVE SENSOR • 1080P`, bracketPadding + 6, bracketPadding + 30);

  // Live Timestamp in top right
  const liveIsoDate = new Date(now).toISOString().replace('T', ' ').substring(0, 19);
  ctx.textAlign = 'right';
  ctx.fillText(liveIsoDate, width - bracketPadding - 6, bracketPadding + 16);
  ctx.textAlign = 'left';

  // -------------------------------------------------------------
  // 2. Draw Live Computer Vision Overlays (Bounding Boxes & IDs)
  // -------------------------------------------------------------
  for (const track of tracks) {
    const px = track.bbox.x * width;
    const py = track.bbox.y * height;
    const pw = track.bbox.width * width;
    const ph = track.bbox.height * height;

    // Student Body Silhouette
    const centerX = px + pw / 2;
    const headRadius = pw * 0.28;
    const headCenterY = py + headRadius + 4;

    // Torso
    ctx.fillStyle = 'rgba(30, 58, 138, 0.65)'; // deep academic navy shirt
    ctx.beginPath();
    ctx.ellipse(centerX, py + ph * 0.65, pw * 0.38, ph * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head / Face
    ctx.fillStyle = track.face_visible ? 'rgba(226, 232, 240, 0.9)' : 'rgba(100, 116, 139, 0.7)';
    ctx.beginPath();
    ctx.arc(centerX, headCenterY, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.arc(centerX, headCenterY - 2, headRadius * 0.95, Math.PI, Math.PI * 2);
    ctx.fill();

    // Head orientation vector (visual gaze ray)
    const gazeLength = headRadius * 1.8;
    let gazeAngle = Math.PI / 2; // downwards facing paper by default
    if (track.head_pose.direction === 'left') {
      gazeAngle = Math.PI * 0.85; // looking left
    } else if (track.head_pose.direction === 'right') {
      gazeAngle = Math.PI * 0.15; // looking right
    } else if (track.head_pose.direction === 'up') {
      gazeAngle = -Math.PI / 2;
    }

    const gazeEndX = centerX + Math.cos(gazeAngle) * gazeLength;
    const gazeEndY = headCenterY + Math.sin(gazeAngle) * gazeLength;

    ctx.strokeStyle = track.head_pose.direction !== 'center' ? '#f59e0b' : 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, headCenterY);
    ctx.lineTo(gazeEndX, gazeEndY);
    ctx.stroke();

    // Small directional gaze arrow tip
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(gazeEndX, gazeEndY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Mobile Phone Object Overlay if detected
    if (track.phone_detected) {
      const phoneX = px + pw * 0.6;
      const phoneY = py + ph * 0.55;
      const phoneW = pw * 0.22;
      const phoneH = ph * 0.20;

      // Glow pulsation
      const pulse = (Math.sin(now / 180) + 1) / 2;
      ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + pulse * 0.4})`;
      ctx.fillRect(phoneX - 3, phoneY - 3, phoneW + 6, phoneH + 6);

      // Phone screen
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.fillRect(phoneX, phoneY, phoneW, phoneH);
      ctx.strokeRect(phoneX, phoneY, phoneW, phoneH);

      // Phone screen luminescence
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(phoneX + 2, phoneY + 2, phoneW - 4, phoneH - 4);
    }
  }

  // -------------------------------------------------------------
  // 3. Draw Live Computer Vision Overlays (Bounding Boxes & IDs)
  // -------------------------------------------------------------
  for (const track of tracks) {
    const px = track.bbox.x * width;
    const py = track.bbox.y * height;
    const pw = track.bbox.width * width;
    const ph = track.bbox.height * height;

    const isSelected = track.track_id === selectedTrackId;
    const isHighSuspicion = track.suspicion_score >= highSuspicionThreshold;
    const isWarning = track.suspicion_score >= 35 && !isHighSuspicion;

    // Color schema based on explainable suspicion score
    let borderColor = '#06b6d4'; // Cyan default (normal monitoring)
    let badgeBg = 'rgba(6, 182, 212, 0.9)';
    if (isHighSuspicion) {
      borderColor = '#ef4444'; // Red for high monitoring alert
      badgeBg = 'rgba(239, 68, 68, 0.95)';
    } else if (isWarning) {
      borderColor = '#f59e0b'; // Amber for warning threshold
      badgeBg = 'rgba(245, 158, 11, 0.95)';
    }

    if (isSelected) {
      borderColor = '#38bdf8'; // Bright sky blue when user selects track
    }

    // High precision bounding box corners (military/pro surveillance styling)
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;

    // Main box
    ctx.strokeRect(px, py, pw, ph);

    // Accent corner brackets
    const cornerLen = Math.min(14, pw * 0.2);
    ctx.lineWidth = 3;
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

    // Center crosshair
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy);
    ctx.lineTo(cx + 5, cy);
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx, cy + 5);
    ctx.stroke();

    // -------------------------------------------------------------
    // Header Tag: Scoped Track ID (CAM1-S001) & Associated Student
    // -------------------------------------------------------------
    const student = students.find(s => s.id === track.associated_student_id);
    const tagText = `${track.track_id} (${Math.round(track.confidence * 100)}%)`;
    
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    const tagWidth = ctx.measureText(tagText).width + 12;
    const tagHeight = 18;

    // Header badge background
    ctx.fillStyle = badgeBg;
    ctx.fillRect(px, py - tagHeight, tagWidth, tagHeight);

    // Header text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, px + 6, py - 6);

    // Student Identification Tag below header
    if (student) {
      const studentLabel = `${student.name} • ${student.student_id_number}`;
      ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
      const labelW = ctx.measureText(studentLabel).width + 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(px + tagWidth + 2, py - tagHeight, labelW, tagHeight);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + tagWidth + 2, py - tagHeight, labelW, tagHeight);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(studentLabel, px + tagWidth + 8, py - 6);
    }

    // -------------------------------------------------------------
    // Footer Telemetry: Suspicion Score & Behavior Status Pills
    // -------------------------------------------------------------
    const scoreText = `Score: ${track.suspicion_score}`;
    ctx.font = '600 10px "JetBrains Mono", monospace';
    const scoreW = ctx.measureText(scoreText).width + 10;
    const footerY = py + ph + 16;

    // Score badge
    ctx.fillStyle = isHighSuspicion ? 'rgba(239, 68, 68, 0.9)' : (isWarning ? 'rgba(245, 158, 11, 0.9)' : 'rgba(15, 23, 42, 0.85)');
    ctx.fillRect(px, footerY - 12, scoreW, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(scoreText, px + 5, footerY);

    // Behavior badges (Gaze / Phone / Face)
    let badgeOffset = scoreW + 4;
    if (track.head_pose.direction !== 'center') {
      const dirText = `LOOKING ${track.head_pose.direction.toUpperCase()}`;
      ctx.font = '600 9px "JetBrains Mono", monospace';
      const dirW = ctx.measureText(dirText).width + 8;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.fillRect(px + badgeOffset, footerY - 12, dirW, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(dirText, px + badgeOffset + 4, footerY);
      badgeOffset += dirW + 4;
    }

    if (track.phone_detected) {
      const phoneText = 'PHONE DETECTED';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const phoneW = ctx.measureText(phoneText).width + 8;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      ctx.fillRect(px + badgeOffset, footerY - 12, phoneW, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(phoneText, px + badgeOffset + 4, footerY);
      badgeOffset += phoneW + 4;
    }

    if (!track.face_visible) {
      const faceText = 'FACE OCCLUDED';
      ctx.font = '600 9px "JetBrains Mono", monospace';
      const faceW = ctx.measureText(faceText).width + 8;
      ctx.fillStyle = 'rgba(234, 88, 12, 0.9)';
      ctx.fillRect(px + badgeOffset, footerY - 12, faceW, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(faceText, px + badgeOffset + 4, footerY);
      badgeOffset += faceW + 4;
    }

    // Cross-Camera Best View Arbitration Badge
    if (student && student.active_observations && student.active_observations.length > 0) {
      const myObs = student.active_observations.find(o => o.camera_id === cameraId);
      const isBest = myObs ? myObs.is_best_view : false;
      const bestObs = student.active_observations.find(o => o.is_best_view);
      
      const bestText = isBest 
        ? `★ BEST VIEW (${Math.round(myObs?.quality || 90)}%)` 
        : `BEST: ${bestObs ? bestObs.camera_id.toUpperCase().replace('-', ' ') : 'OTHER'}`;
      
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const bestW = ctx.measureText(bestText).width + 8;
      ctx.fillStyle = isBest ? 'rgba(16, 185, 129, 0.95)' : 'rgba(51, 65, 85, 0.85)';
      ctx.fillRect(px + badgeOffset, footerY - 12, bestW, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(bestText, px + badgeOffset + 4, footerY);
    }
  }

  // Restore transform
  ctx.restore();

  // -------------------------------------------------------------
  // 4. On-Screen Camera HUD (Top Left & Top Right)
  // -------------------------------------------------------------
  // Camera Name & Mode Pill (Top Left)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(14, 14, 280, 32, 6);
  ctx.fill();
  ctx.stroke();

  // Flashing recording dot
  const isPulse = Math.floor(now / 500) % 2 === 0;
  ctx.fillStyle = isPulse ? '#ef4444' : '#991b1b';
  ctx.beginPath();
  ctx.arc(26, 30, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(cameraName, 38, 34);

  // Top Right Telemetry: FPS, Timestamp & Resolution
  const dateStr = new Date(now).toLocaleTimeString('en-US', { hour12: false });
  const hudInfo = `LIVE REC • ${dateStr} • 15.0 FPS`;
  ctx.font = '600 11px "JetBrains Mono", monospace';
  const hudW = ctx.measureText(hudInfo).width + 16;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  ctx.roundRect(width - hudW - 14, 14, hudW, 32, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.fillText(hudInfo, width - hudW - 6, 34);

  // Zoom factor indicator if zoomed
  if (zoomLevel > 1.0) {
    const zoomText = `ZOOM ${zoomLevel.toFixed(1)}X (DRAG TO PAN)`;
    ctx.fillStyle = 'rgba(234, 88, 12, 0.9)';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const zw = ctx.measureText(zoomText).width + 14;
    ctx.fillRect(14, height - 34, zw, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(zoomText, 21, height - 19);
  }
}
