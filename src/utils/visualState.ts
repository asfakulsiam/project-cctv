/**
 * Smart Classroom Exam Monitoring System
 * Centralized Visual State & Telemetry Color Hierarchy
 */

export type VisualState = 'normal' | 'warning' | 'critical';

export interface VisualStateStyle {
  state: VisualState;
  primaryColor: string;
  secondaryColor: string;
  badgeBg: string;
  badgeText: string;
  borderClass: string;
  textClass: string;
  label: string;
}

/**
 * Calculates visual alert state based on standardized suspicion score thresholds.
 * - Normal: < 35 (Emerald Green)
 * - Warning / Attention: 35 - 64 (High-Visibility Yellow)
 * - Critical Alert: >= 65 (Crimson Red)
 */
export function getTrackVisualState(
  score: number,
  highThreshold: number = 65,
  warningThreshold: number = 35
): VisualState {
  if (score >= highThreshold) {
    return 'critical';
  }
  if (score >= warningThreshold) {
    return 'warning';
  }
  return 'normal';
}

export const VISUAL_STATE_CONFIG: Record<VisualState, VisualStateStyle> = {
  normal: {
    state: 'normal',
    primaryColor: '#10b981',
    secondaryColor: 'rgba(16, 185, 129, 0.14)',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    borderClass: 'border-emerald-500/40',
    textClass: 'text-emerald-400',
    label: 'Normal'
  },
  warning: {
    state: 'warning',
    primaryColor: '#eab308',
    secondaryColor: 'rgba(234, 179, 8, 0.18)',
    badgeBg: 'bg-yellow-500/20',
    badgeText: 'text-yellow-400',
    borderClass: 'border-yellow-500/50',
    textClass: 'text-yellow-400',
    label: 'Warning'
  },
  critical: {
    state: 'critical',
    primaryColor: '#ef4444',
    secondaryColor: 'rgba(239, 68, 68, 0.22)',
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-400',
    borderClass: 'border-red-500/60',
    textClass: 'text-red-400',
    label: 'Critical Alert'
  }
};
