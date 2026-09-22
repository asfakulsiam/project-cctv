import { CameraTrack, ExamCandidate } from '../types.js';

export interface RenderOptions {
  showFloatingTags?: boolean;
  highlightWarnings?: boolean;
}

/**
 * Renders live stream visual tracking layer with dynamic floating nameplates.
 * Strictly avoids fixed grid/seatplan overlays or rigid box cages.
 */
export function renderCanvasOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  candidates: (ExamCandidate | CameraTrack)[],
  options: RenderOptions = { showFloatingTags: true, highlightWarnings: true }
): void {
  ctx.clearRect(0, 0, width, height);

  for (const person of candidates) {
    const bbox = person.bbox;
    if (!bbox) continue;

    const x = bbox.x * width;
    const y = bbox.y * height;
    const boxW = bbox.width * width;

    // Anchor floating nameplate right above the person's head
    const headX = (person as any).head_point?.x !== undefined 
      ? (person as any).head_point.x * width 
      : x + boxW * 0.5;
    const headY = (person as any).head_point?.y !== undefined 
      ? (person as any).head_point.y * height 
      : y;

    const tagY = Math.max(30, headY - 14);

    // Identity label
    const name = (person as ExamCandidate).student_name || 
                 (person as ExamCandidate).person_id || 
                 (person as CameraTrack).person_id || 
                 'Student';

    const isWarning = person.warning_active || ((person as any).suspicion_score || 0) >= 0.5;
    const isCritical = ((person as any).suspicion_score || 0) >= 0.75;

    // Subtle head anchor dot
    ctx.beginPath();
    ctx.arc(headX, headY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = isCritical ? '#ef4444' : (isWarning ? '#f59e0b' : '#3b82f6');
    ctx.fill();

    // Floating Nameplate Tag
    const tagText = name;
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textMetrics = ctx.measureText(tagText);
    const tagPadding = 10;
    const tagWidth = textMetrics.width + tagPadding * 2 + 18;
    const tagHeight = 26;
    const tagX = headX - tagWidth / 2;

    // Rounded tag background with glass tint
    ctx.save();
    ctx.beginPath();
    const radius = 6;
    ctx.roundRect(tagX, tagY - tagHeight, tagWidth, tagHeight, radius);
    ctx.fillStyle = isCritical ? 'rgba(127, 29, 29, 0.88)' : (isWarning ? 'rgba(120, 53, 15, 0.88)' : 'rgba(15, 23, 42, 0.82)');
    ctx.fill();
    ctx.strokeStyle = isCritical ? 'rgba(239, 68, 68, 0.7)' : (isWarning ? 'rgba(245, 158, 11, 0.7)' : 'rgba(59, 130, 246, 0.4)');
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Status indicator beacon
    ctx.beginPath();
    ctx.arc(tagX + tagPadding + 4, tagY - tagHeight / 2, 4, 0, 2 * Math.PI);
    ctx.fillStyle = isCritical ? '#ef4444' : (isWarning ? '#f59e0b' : '#10b981');
    ctx.fill();

    // Student identity text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, tagX + tagPadding + 14, tagY - tagHeight / 2);

    ctx.restore();
  }
}
