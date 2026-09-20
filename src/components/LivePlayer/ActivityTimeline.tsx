/**
 * Apple Human Interface Guidelines Activity Timeline
 * Clean, scannable event feed with Cupertino segmented filter,
 * semantic event badges, and quick camera jump actions.
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
  ChevronRight
} from 'lucide-react';
import { Card } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';

interface ActivityTimelineProps {
  onInspectStudent?: (studentId: string) => void;
  maxEvents?: number;
}

export function ActivityTimeline({ onInspectStudent, maxEvents = 30 }: ActivityTimelineProps) {
  const { events, setFocusedCameraId } = useMonitoring();
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'high' | 'warning' | 'info'>('all');

  const filteredEvents = events.filter(e => {
    if (filterSeverity === 'all') return true;
    return e.severity === filterSeverity;
  }).slice(0, maxEvents);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'PHONE_DETECTED':
        return <Smartphone className="w-3.5 h-3.5 text-[var(--system-destructive)]" />;
      case 'FACE_NOT_VISIBLE':
        return <EyeOff className="w-3.5 h-3.5 text-[var(--system-warning)]" />;
      case 'LEFT_SEAT':
        return <LogOut className="w-3.5 h-3.5 text-[var(--system-destructive)]" />;
      case 'RETURNED_TO_SEAT':
        return <LogIn className="w-3.5 h-3.5 text-[var(--system-success)]" />;
      case 'LOOKING_LEFT':
      case 'LOOKING_RIGHT':
        return <RotateCcw className="w-3.5 h-3.5 text-[var(--system-warning)]" />;
      default:
        return <Info className="w-3.5 h-3.5 text-[var(--system-accent)]" />;
    }
  };

  const getSeverityVariant = (severity: string): 'destructive' | 'warning' | 'secondary' => {
    switch (severity) {
      case 'high':
        return 'destructive';
      case 'warning':
        return 'warning';
      default:
        return 'secondary';
    }
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

        {/* Apple Segmented Control */}
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
      </div>

      {/* Events List */}
      <div className="divide-y divide-[var(--system-separator)] overflow-y-auto max-h-[500px]">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-[var(--system-text-tertiary)] space-y-1">
            <Info className="w-5 h-5 mx-auto text-[var(--system-text-quaternary)]" />
            <p>No activity events matching selected filter.</p>
          </div>
        ) : (
          filteredEvents.map(event => (
            <div
              key={event.id}
              className="p-3 hover:bg-[var(--system-fill-secondary)] transition-colors flex items-start justify-between gap-3 text-[12px]"
            >
              <div className="flex items-start space-x-2.5 min-w-0">
                <div className="mt-0.5 p-1 rounded-[6px] bg-[var(--system-fill)] flex-shrink-0">
                  {getEventIcon(event.event_type)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <span className="font-semibold text-[var(--system-text-primary)] truncate">
                      {event.event_type.replace(/_/g, ' ')}
                    </span>
                    <Badge variant={getSeverityVariant(event.severity)}>
                      {event.severity}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-[var(--system-text-secondary)] mt-0.5 leading-relaxed">
                    {event.description}
                  </p>
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
          ))
        )}
      </div>

    </Card>
  );
}
