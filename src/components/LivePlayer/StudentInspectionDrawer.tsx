/**
 * Smart Classroom Exam Monitoring System
 * Student Identity & Cross-Camera Observation Inspector
 * 
 * CORE REQUIREMENT:
 * - Shows unified student record across multiple cameras
 * - Highlights the clearest available camera observation (is_best_view)
 * - Displays explainable Suspicion Score breakdown
 * - Allows switching to the best camera angle with a single click
 */

import React from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { StudentRecord } from '../../types.js';
import { 
  X, 
  Eye, 
  Camera, 
  ShieldAlert, 
  CheckCircle, 
  Clock, 
  MapPin, 
  ChevronRight,
  ExternalLink,
  Sparkles
} from 'lucide-react';

interface StudentInspectionDrawerProps {
  student: StudentRecord;
  onClose: () => void;
}

export function StudentInspectionDrawer({ student, onClose }: StudentInspectionDrawerProps) {
  const { cameras, setFocusedCameraId, events } = useMonitoring();

  const studentEvents = events.filter(e => e.student_id === student.id).slice(0, 10);
  const bestObservation = student.active_observations.find(o => o.is_best_view);

  const getSuspicionLevel = (score: number) => {
    if (score >= 60) return { label: 'ELEVATED MONITORING', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
    if (score >= 35) return { label: 'ATTENTION ADVISORY', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    return { label: 'NORMAL BEHAVIOR', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
  };

  const level = getSuspicionLevel(student.unified_suspicion_score);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-y-auto">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
          <div>
            <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
              Unified Identity Record
            </span>
            <h2 className="text-base font-bold text-white mt-0.5">{student.name}</h2>
            <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono mt-0.5">
              <span>ID: <strong className="text-slate-200">{student.student_id_number}</strong></span>
              <span>•</span>
              <span>Desk: {student.seat_id?.toUpperCase() || 'Assigned Desk'}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5 flex-1">
          
          {/* Suspicion Score Card */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Monitoring Suspicion Score
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${level.color}`}>
                {level.label}
              </span>
            </div>

            <div className="mt-3 flex items-baseline space-x-3">
              <span className="text-3xl font-bold font-mono text-white">
                {student.unified_suspicion_score}
              </span>
              <span className="text-xs text-slate-500 font-mono">/ 100 max index</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  student.unified_suspicion_score >= 60 ? 'bg-rose-500' :
                  student.unified_suspicion_score >= 35 ? 'bg-amber-400' : 'bg-cyan-500'
                }`}
                style={{ width: `${student.unified_suspicion_score}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-2 italic leading-relaxed">
              * The Suspicion Score represents an objective behavioral telemetry index, not a definitive disciplinary conclusion.
            </p>
          </div>

          {/* Cross-Camera Observations & Nearest Best View */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Camera className="w-4 h-4 text-cyan-400" />
                <span>Multi-Camera Observations ({student.active_observations.length})</span>
              </h3>
              <span className="text-[11px] text-cyan-400 font-mono">
                Quality Weighted
              </span>
            </div>

            <div className="space-y-2">
              {student.active_observations.map((obs, idx) => {
                const cam = cameras.find(c => c.camera_id === obs.camera_id);
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border transition-all ${
                      obs.is_best_view
                        ? 'bg-cyan-950/30 border-cyan-500/50 shadow-md shadow-cyan-500/5'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-xs text-white">
                          {cam?.name || obs.camera_id.toUpperCase()}
                        </span>
                        {obs.is_best_view && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500 text-slate-950 flex items-center space-x-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>CLEARER OBSERVATION</span>
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setFocusedCameraId(obs.camera_id);
                          onClose();
                        }}
                        className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
                      >
                        <span>Switch Camera</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 block text-[9px]">ISOLATED TRACK</span>
                        <span className="text-slate-200 font-bold">{obs.track_id}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">CLARITY QUALITY</span>
                        <span className="text-cyan-400 font-bold">{obs.quality}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">CAMERA SCORE</span>
                        <span className="text-slate-200">{obs.suspicion_score} pts</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Student Incident History */}
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Recent Incidents For This Student</span>
            </h3>

            {studentEvents.length === 0 ? (
              <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800 text-center text-xs text-slate-500">
                No behavioral infractions detected.
              </div>
            ) : (
              <div className="space-y-1.5">
                {studentEvents.map(e => (
                  <div key={e.id} className="p-2.5 bg-slate-950/60 rounded border border-slate-800 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-200">{e.event_type.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-slate-500">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-0.5">{e.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer actions */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
}
