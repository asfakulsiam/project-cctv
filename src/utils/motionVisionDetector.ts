/**
 * Smart Classroom Exam Monitoring System
 * Legacy Client Utility Module (Non-Authoritative Stub)
 * 
 * ARCHITECTURAL INVARIANT:
 * All authoritative person detection, temporal confirmation, Global Person IDs (P-001, P-002),
 * behavioral analysis, warning latching, and scoring are executed exclusively by the
 * server-authoritative CV pipeline in /server/cv/*.
 * 
 * Browser clients receive and render server-streamed telemetry via WebSocket without
 * running secondary or competing tracking pipelines in the UI layer.
 */

import { BoundingBox, HumanDetection } from '../types.js';

export interface OpticalFlowVector {
  dx: number;
  dy: number;
  magnitude: number;
}

/**
 * Lightweight bounding box helper for UI calculations.
 * Does NOT generate identities, tracks, or scores.
 */
export function calculateBoxCenter(bbox: BoundingBox): { x: number; y: number } {
  return {
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2
  };
}

/**
 * Lightweight helper to filter raw detection array by confidence.
 */
export function filterPersonDetections(
  detections: HumanDetection[],
  minConfidence: number = 0.65
): HumanDetection[] {
  return detections.filter(
    d => d.class_name === 'person' && d.confidence >= minConfidence
  );
}
