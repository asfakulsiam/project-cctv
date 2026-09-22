/**
 * Apple Human Interface Guidelines Student Inspection Sheet
 * Unified student identity sheet with multi-camera perspective telemetry,
 * clearest perspective indicators, and incident history.
 */

import React, { useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { StudentRecord } from '../../types.js';
import { 
  Camera, 
  Clock, 
  Sparkles,
  ChevronRight,
  RotateCcw,
  CheckCircle2
} from 'lucide-react';
import { Sheet } from '../ui/Sheet.js';
import { Badge } from '../ui/Badge.js';
import { Card } from '../ui/Card.js';
import { Button } from '../ui/Button.js';

interface StudentInspectionDrawerProps {
  student: StudentRecord;
  onClose: () => void;
}

export function StudentInspectionDrawer({ student, onClose }: StudentInspectionDrawerProps) {
  const { cameras, setFocusedCameraId, events, clearStudentWarning, settings } = useMonitoring();
  const [clearing, setClearing] = useState(false);
  const [clearedSuccess, setClearedSuccess] = useState(false);

  const handleClearWarning = async () => {
    setClearing(true);
    await clearStudentWarning(student.id);
    setClearing(false);
    setClearedSuccess(true);
    setTimeout(() => setClearedSuccess(false), 2500);
  };

  const studentEvents = events.filter(e => e.student_id === student.id).slice(0, 10);
  const bestObservation = student.active_observations.find(o => o.is_best_view);

  const highThreshold = settings?.thresholds?.high_suspicion_threshold ?? 65;
  const warningThreshold = settings?.thresholds?.warning_suspicion_threshold ?? 40;

  const currentScore = student.current_score ?? 0;
  const cumulativeScore = student.cumulative_score ?? student.unified_suspicion_score ?? 0;
  const maxScore = student.max_score ?? Math.max(currentScore, cumulativeScore);

  const getSuspicionVariant = (score: number): 'success' | 'warning' | 'destructive' => {
    if (score >= highThreshold) return 'destructive';
    if (score >= warningThreshold) return 'warning';
    return 'success';
  };

  const suspicionVariant = getSuspicionVariant(cumulativeScore);
  const suspicionLabel = cumulativeScore >= highThreshold 
    ? 'CRITICAL MONITORING (RED)' 
    : cumulativeScore >= warningThreshold 
      ? 'WARNING ADVISORY (YELLOW)' 
      : 'NORMAL PATTERN (GREEN)';

  return (
    <Sheet
      isOpen={true}
      onClose={onClose}
      title={`Candidate ${student.student_id_number}`}
      description={`Seat: ${student.seat_id?.toUpperCase() || 'Assigned'} • System ID: ${student.id}`}
      size="md"
    >
      <div className="space-y-4">
        
        {/* Teacher Attention Activity Score Card */}
        <Card padding="md" className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[var(--system-text-secondary)]">
              Teacher Attention Activity Index
            </span>
            <Badge variant={suspicionVariant}>
              {suspicionLabel}
            </Badge>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="space-y-1">
              <div className="flex items-baseline space-x-2">
                <span className="text-[28px] font-bold font-mono-apple text-[var(--system-text-primary)]">
                  {cumulativeScore}
                </span>
                <span className="text-[12px] text-[var(--system-text-tertiary)] font-mono-apple">
                  / 100 cumulative
                </span>
              </div>
              <div className="flex items-center space-x-3 text-[11px] font-mono-apple">
                <span className="text-[var(--system-accent)]">Current: <strong>{currentScore}</strong></span>
                <span className="text-[var(--system-text-tertiary)]">•</span>
                <span className="text-amber-400">Peak: <strong>{maxScore}</strong></span>
              </div>
            </div>

            {/* Admin Clear Warning Button */}
            <button
              onClick={handleClearWarning}
              disabled={clearing}
              className={`px-3 py-1.5 rounded-[8px] text-[11px] font-semibold flex items-center space-x-1.5 cursor-pointer transition-all ${
                clearedSuccess
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-[var(--system-fill)] hover:bg-[var(--system-fill-hover)] text-[var(--system-text-primary)] border border-[var(--system-chrome-border)]'
              }`}
            >
              {clearedSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Indicator Reset</span>
                </>
              ) : (
                <>
                  <RotateCcw className={`w-3.5 h-3.5 ${clearing ? 'animate-spin' : ''}`} />
                  <span>Reset Indicator</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[11px] text-[var(--system-text-tertiary)] italic pt-1 border-t border-[var(--system-chrome-border)]">
            Note: Scores indicate observable activity requiring teacher review, not a judgment of guilt or cheating. The teacher remains the final authority.
          </p>

          {/* Progress bar */}
          <div className="w-full bg-[var(--system-fill)] h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                cumulativeScore >= highThreshold ? 'bg-[var(--system-destructive)]' :
                cumulativeScore >= warningThreshold ? 'bg-[var(--system-warning)]' : 'bg-[var(--system-accent)]'
              }`}
              style={{ width: `${cumulativeScore}%` }}
            />
          </div>

          <p className="text-[11px] text-[var(--system-text-tertiary)] italic leading-relaxed">
            * Cumulative score tracks session history; clearing resets active immediate window while maintaining audit trail.
          </p>
        </Card>

        {/* Cross-Camera Perspectives */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-[var(--system-text-primary)] flex items-center space-x-1.5">
              <Camera className="w-4 h-4 text-[var(--system-accent)]" />
              <span>Multi-Camera Angles ({student.active_observations.length})</span>
            </h3>
            <span className="text-[11px] text-[var(--system-accent)] font-mono-apple">
              Quality-Ranked
            </span>
          </div>

          <div className="space-y-2">
            {student.active_observations.map((obs, idx) => {
              const cam = cameras.find(c => c.camera_id === obs.camera_id);

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-[12px] border transition-all ${
                    obs.is_best_view
                      ? 'bg-[var(--system-accent-subtle)] border-[var(--system-accent)]/30'
                      : 'bg-[var(--system-fill)] border-[var(--system-chrome-border)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-[13px] text-[var(--system-text-primary)]">
                        {cam?.name || obs.camera_id}
                      </span>
                      {obs.is_best_view && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--system-accent)] text-white flex items-center space-x-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>BEST ANGLE</span>
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setFocusedCameraId(obs.camera_id);
                        onClose();
                      }}
                      className="text-[12px] font-semibold text-[var(--system-accent)] hover:opacity-80 flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Switch Angle</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[var(--system-separator)] text-[11px] font-mono-apple">
                    <div>
                      <span className="text-[var(--system-text-tertiary)] block text-[10px]">TRACK</span>
                      <span className="text-[var(--system-text-primary)] font-bold">{obs.track_id}</span>
                    </div>
                    <div>
                      <span className="text-[var(--system-text-tertiary)] block text-[10px]">CLARITY</span>
                      <span className="text-[var(--system-accent)] font-bold">{obs.quality}%</span>
                    </div>
                    <div>
                      <span className="text-[var(--system-text-tertiary)] block text-[10px]">ANGLE SCORE</span>
                      <span className="text-[var(--system-text-secondary)]">{obs.suspicion_score} pts</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Student Incident History */}
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--system-text-primary)] mb-2 flex items-center space-x-1.5">
            <Clock className="w-4 h-4 text-[var(--system-warning)]" />
            <span>Telemetry Incident Log</span>
          </h3>

          {studentEvents.length === 0 ? (
            <Card padding="md" className="text-center text-[12px] text-[var(--system-text-tertiary)]">
              No behavioral infractions detected for this candidate.
            </Card>
          ) : (
            <div className="space-y-1.5">
              {studentEvents.map(e => (
                <div key={e.id} className="p-2.5 bg-[var(--system-fill)] rounded-[10px] border border-[var(--system-chrome-border)] text-[12px]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[var(--system-text-primary)]">{e.event_type.replace(/_/g, ' ')}</span>
                    <span className="font-mono-apple text-[var(--system-text-tertiary)]">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[var(--system-text-secondary)] text-[11px] mt-0.5">{e.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Done
          </Button>
        </div>

      </div>
    </Sheet>
  );
}
