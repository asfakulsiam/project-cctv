/**
 * Apple Human Interface Guidelines Activity Timeline
 * Clean, scannable event feed with Cupertino segmented filter,
 * semantic event badges, prominent Track IDs, Student IDs, score deltas, and camera jump actions.
 */

import React, { useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { 
  AlertTriangle, 
  Smartphone, 
  EyeOff, 
  RotateCcw, 
  LogOut, 
  LogIn, 
  Info, 
  Clock, 
  Video,
  ChevronRight,
  User,
  Trash2
} from 'lucide-react';
import { Card } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';

interface ActivityTimelineProps {
  onInspectStudent?: (studentId: string) => void;
  maxEvents?: number;
}

export function ActivityTimeline({ onInspectStudent, maxEvents = 35 }: ActivityTimelineProps) {
  const { events, students, setFocusedCameraId, clearActivityEvents } = useMonitoring();
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'high' | 'warning' | 'info'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  const isAdmin = Boolean(localStorage.getItem('admin_token'));

  const handleClearActivity = async () => {
    setIsClearing(true);
    try {
      await clearActivityEvents();
      setShowClearConfirm(false);
    } finally {
      setIsClearing(false);
    }
  };

  const filteredEvents = events.filter(e => {
    if (filterSeverity === 'all') return true;
    return e.severity === filterSeverity;
  }).slice(0, maxEvents);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'PHONE_DETECTED':
        return <Smartphone className="w-3.5 h-3.5 text-red-400" />;
      case 'FACE_NOT_VISIBLE':
        return <EyeOff className="w-3.5 h-3.5 text-yellow-400" />;
      case 'LEFT_SEAT':
        return <LogOut className="w-3.5 h-3.5 text-red-400" />;
      case 'RETURNED_TO_SEAT':
        return <LogIn className="w-3.5 h-3.5 text-emerald-400" />;
      case 'LOOKING_LEFT':
      case 'LOOKING_RIGHT':
      case 'REPEATED_LOOKING':
        return <RotateCcw className="w-3.5 h-3.5 text-yellow-400" />;
      default:
        return <Info className="w-3.5 h-3.5 text-sky-400" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    if (severity === 'high') {
      return (
        <span className="px-1.5 py-0.5 rounded-[5px] text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/40 uppercase tracking-wide">
          CRITICAL
        </span>
      );
    }
    if (severity === 'warning') {
      return (
        <span className="px-1.5 py-0.5 rounded-[5px] text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 uppercase tracking-wide">
          WARNING
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded-[5px] text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 uppercase tracking-wide">
        INFO
      </span>
    );
  };

  return (
    <Card padding="none" className="flex flex-col h-full overflow-hidden">
      
      {/* Header & Segmented Filter */}
      <div className="p-3.5 bg-[var(--system-chrome-bg)] backdrop-blur-md border-b border-[var(--system-chrome-border)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-[var(--system-accent)]" />
          <h3 className="text-[13px] font-semibold text-[var(--system-text-primary)] tracking-tight">
            Activity Timeline
          </h3>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono-apple bg-[var(--system-fill)] text-[var(--system-text-secondary)]">
            {events.length}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Segmented Filter */}
          <div className="flex items-center bg-[var(--system-fill)] p-0.5 rounded-[9px] border border-[var(--system-chrome-border)] text-[11px]">
            {(['all', 'high', 'warning', 'info'] as const).map(sev => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-2 py-1 rounded-[7px] font-medium transition-all cursor-pointer capitalize ${
                  filterSeverity === sev
                    ? 'bg-[var(--system-secondary-bg)] text-[var(--system-text-primary)] shadow-sm font-semibold'
                    : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)]'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          {/* Admin Clear Activity Button */}
          {isAdmin && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="p-1.5 rounded-[7px] bg-[var(--system-fill)] hover:bg-rose-950/40 text-[var(--system-text-secondary)] hover:text-rose-400 border border-[var(--system-chrome-border)] transition-colors cursor-pointer"
              title="Clear Activity Events"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Clear Confirmation Modal / Banner */}
      {showClearConfirm && (
        <div className="p-3 bg-rose-950/30 border-b border-rose-800/40 flex items-center justify-between gap-2 text-[12px]">
          <span className="text-rose-200">Clear all recorded activity events? Scores and tracks are preserved.</span>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleClearActivity}
              disabled={isClearing}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium text-[11px] transition-colors"
            >
              {isClearing ? 'Clearing...' : 'Confirm Clear'}
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Events Feed */}
      <div className="divide-y divide-[var(--system-separator)] overflow-y-auto max-h-[520px]">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-[var(--system-text-tertiary)] space-y-1">
            <Info className="w-5 h-5 mx-auto text-[var(--system-text-quaternary)]" />
            <p>No activity events matching selected filter.</p>
          </div>
        ) : (
          filteredEvents.map(event => {
            const trackIdDisplay = event.track_id || 'UNASSIGNED';
            const personIdDisplay = event.global_person_id || 'UNASSIGNED';

            return (
              <div
                key={event.id}
                className="p-3 hover:bg-[var(--system-fill-secondary)] transition-colors flex items-start justify-between gap-3 text-[12px]"
              >
                <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                  <div className="mt-0.5 p-1.5 rounded-[7px] bg-[var(--system-fill)] flex-shrink-0">
                    {getEventIcon(event.event_type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Top line: Person ID + Track ID + Event Title + Severity Badge */}
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      {/* Person ID Pill */}
                      <span className="px-1.5 py-0.5 rounded-[4px] font-mono-apple text-[10px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                        {personIdDisplay}
                      </span>

                      {/* Camera Track ID Pill */}
                      <span className="px-1.5 py-0.5 rounded-[4px] font-mono-apple text-[10px] font-semibold bg-slate-800 text-sky-400 border border-slate-700">
                        {trackIdDisplay}
                      </span>

                      {/* Event Type */}
                      <span className="font-semibold text-[var(--system-text-primary)] truncate text-[12px]">
                        {event.event_type.replace(/_/g, ' ')}
                      </span>

                      {/* Severity Badge */}
                      {getSeverityBadge(event.severity)}

                      {/* Score Delta */}
                      {event.score_contribution !== undefined && event.score_contribution !== 0 && (
                        <span className={`px-1 py-0.2 rounded font-mono-apple text-[10px] font-bold ${
                          event.score_contribution > 0 
                            ? 'text-yellow-400 bg-yellow-500/10' 
                            : 'text-emerald-400 bg-emerald-500/10'
                        }`}>
                          {event.score_contribution > 0 ? `+${event.score_contribution}` : event.score_contribution} pts
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-[12px] text-[var(--system-text-secondary)] mt-0.5 leading-relaxed">
                      {event.description}
                    </p>

                    {/* Footer Metadata */}
                    <div className="flex items-center space-x-3 text-[10px] font-mono-apple text-[var(--system-text-tertiary)] mt-1">
                      <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                      <span>•</span>
                      <button
                        onClick={() => setFocusedCameraId(event.camera_id)}
                        className="hover:text-[var(--system-accent)] transition-colors flex items-center space-x-1 cursor-pointer"
                      >
                        <Video className="w-2.5 h-2.5" />
                        <span>{event.camera_id}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inspect Student Action */}
                {event.student_id && onInspectStudent && (
                  <button
                    onClick={() => onInspectStudent(event.student_id!)}
                    className="px-2 py-1 rounded-[6px] bg-[var(--system-accent-subtle)] text-[var(--system-accent)] text-[11px] font-medium hover:opacity-80 transition-opacity flex-shrink-0 flex items-center space-x-0.5 cursor-pointer mt-1"
                  >
                    <span>Inspect</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

    </Card>
  );
}
