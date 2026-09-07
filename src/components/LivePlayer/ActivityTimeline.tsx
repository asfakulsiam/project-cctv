/**
 * Smart Classroom Exam Monitoring System
 * Realtime Activity Timeline & Event Feed
 * 
 * Displays timestamped computer vision behavioral events with severity
 * filters, camera links, student badges, and explainable penalty impacts.
 */

import React, { useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { BehaviorEvent } from '../../types.js';
import { 
  AlertTriangle, 
  Smartphone, 
  EyeOff, 
  RotateCcw, 
  LogOut, 
  LogIn, 
  Info, 
  Filter, 
  Clock, 
  Video,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

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

  const getEventIcon = (type: string, severity: string) => {
    switch (type) {
      case 'PHONE_DETECTED':
        return <Smartphone className="w-4 h-4 text-rose-400" />;
      case 'FACE_NOT_VISIBLE':
        return <EyeOff className="w-4 h-4 text-amber-400" />;
      case 'LEFT_SEAT':
        return <LogOut className="w-4 h-4 text-rose-400" />;
      case 'RETURNED_TO_SEAT':
        return <LogIn className="w-4 h-4 text-emerald-400" />;
      case 'LOOKING_LEFT':
      case 'LOOKING_RIGHT':
        return <RotateCcw className="w-4 h-4 text-amber-400" />;
      default:
        return <Info className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'warning':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col h-full">
      
      {/* Header & Severity Filter Tabs */}
      <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Live Movement & Incident Timeline
          </h3>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
            {events.length} total
          </span>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
          <button
            onClick={() => setFilterSeverity('all')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterSeverity === 'all'
                ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterSeverity('high')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterSeverity === 'high'
                ? 'bg-rose-950/80 text-rose-400 font-semibold border border-rose-800/40'
                : 'text-slate-400 hover:text-rose-300'
            }`}
          >
            High Alerts
          </button>
          <button
            onClick={() => setFilterSeverity('warning')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterSeverity === 'warning'
                ? 'bg-amber-950/80 text-amber-400 font-semibold border border-amber-800/40'
                : 'text-slate-400 hover:text-amber-300'
            }`}
          >
            Warnings
          </button>
          <button
            onClick={() => setFilterSeverity('info')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterSeverity === 'info'
                ? 'bg-slate-800 text-slate-200 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Info
          </button>
        </div>
      </div>

      {/* Events Scroll Area */}
      <div className="divide-y divide-slate-800/60 overflow-y-auto max-h-[380px] p-1">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center">
            <ShieldCheck className="w-8 h-8 text-emerald-500/40 mb-2" />
            <span>No behavioral incidents recorded for this filter.</span>
          </div>
        ) : (
          filteredEvents.map((event, index) => {
            const timeStr = new Date(event.timestamp).toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });

            return (
              <div 
                key={`${event.id}-${index}`}
                className="p-3 hover:bg-slate-800/40 transition-colors flex items-start justify-between space-x-3 text-xs"
              >
                {/* Left: Icon & Description */}
                <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                  <div className="p-1.5 rounded-md bg-slate-950 border border-slate-800 mt-0.5 flex-shrink-0">
                    {getEventIcon(event.event_type, event.severity)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getSeverityBadge(event.severity)}`}>
                        {event.event_type.replace(/_/g, ' ')}
                      </span>
                      
                      {event.student_name && (
                        <button
                          onClick={() => event.student_id && onInspectStudent?.(event.student_id)}
                          className="text-slate-200 font-semibold hover:text-cyan-400 transition-colors underline decoration-slate-600 truncate"
                        >
                          {event.student_name}
                        </button>
                      )}

                      {event.student_id_number && (
                        <span className="text-[10px] font-mono text-slate-500">
                          ({event.student_id_number})
                        </span>
                      )}
                    </div>

                    <p className="text-slate-300 text-[11px] leading-relaxed break-words">
                      {event.description}
                    </p>

                    {/* Metadata tags: Camera & Track */}
                    <div className="flex items-center space-x-2 mt-1.5 text-[10px] text-slate-500 font-mono">
                      <button
                        onClick={() => setFocusedCameraId(event.camera_id)}
                        className="hover:text-cyan-400 flex items-center space-x-1"
                      >
                        <Video className="w-3 h-3" />
                        <span>{event.camera_id.toUpperCase()}</span>
                      </button>
                      <span>•</span>
                      <span>Track: {event.track_id}</span>
                      {event.score_contribution !== 0 && (
                        <>
                          <span>•</span>
                          <span className={event.score_contribution > 0 ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                            {event.score_contribution > 0 ? `+${event.score_contribution}` : event.score_contribution} pts
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Timestamp */}
                <div className="text-right flex-shrink-0">
                  <span className="font-mono text-[11px] text-slate-400 block">{timeStr}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
