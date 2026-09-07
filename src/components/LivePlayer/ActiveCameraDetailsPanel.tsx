/**
 * Smart Classroom Exam Monitoring System
 * Active Camera Telemetry & Angle Details Panel
 * 
 * Displays rich optical and tracking metadata for the currently active camera view.
 */

import React from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { 
  Camera, 
  Eye, 
  Sparkles, 
  Layers, 
  Wifi, 
  MapPin, 
  ShieldAlert, 
  CheckCircle,
  Activity,
  ChevronRight
} from 'lucide-react';

export function ActiveCameraDetailsPanel() {
  const { 
    cameras, 
    focusedCameraId, 
    primaryCameraId, 
    tracksByCamera, 
    students,
    seats 
  } = useMonitoring();

  const activeCamera = cameras.find(c => c.camera_id === focusedCameraId) || cameras[0];
  const tracks = tracksByCamera[focusedCameraId] || [];
  const isPrimary = activeCamera?.camera_id === primaryCameraId;

  if (!activeCamera) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs space-y-2 shadow-lg">
        <Camera className="w-6 h-6 mx-auto text-slate-600" />
        <h4 className="font-semibold text-slate-300">No Active Perspective</h4>
        <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs mx-auto">
          Surveillance streams have not been configured yet. Register camera endpoints in the Admin Portal to inspect angle coverage and telemetry.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col space-y-4 p-4">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              {activeCamera.name} Perspective
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              ID: {activeCamera.camera_id} • {isPrimary ? 'Primary Surveillance Feed' : 'Secondary Optical Angle'}
            </span>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
          LIVE FEED
        </span>
      </div>

      {/* Optical Perspective Info */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between text-[11px] p-2 rounded bg-slate-950/70 border border-slate-800/80">
          <span className="text-slate-400">View Perspective</span>
          <span className="font-semibold text-slate-200">
            {activeCamera.view_angle_description || 'Surveillance Feed'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2 rounded bg-slate-950/70 border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">Resolution</span>
            <span className="font-mono font-semibold text-slate-300">
              {activeCamera.resolution?.width || 1920}x{activeCamera.resolution?.height || 1080}
            </span>
          </div>
          <div className="p-2 rounded bg-slate-950/70 border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">Clarity Score</span>
            <span className="font-mono font-semibold text-cyan-400">
              {activeCamera.quality_score || 95}%
            </span>
          </div>
        </div>
      </div>

      {/* Monitored Seats / Desks */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium flex items-center space-x-1.5">
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span>Monitored Exam Desks</span>
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {activeCamera.monitored_seats?.length || 0} Desks in FOV
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {(!activeCamera.monitored_seats || activeCamera.monitored_seats.length === 0) ? (
            <span className="text-[11px] text-slate-500 italic">Full examination hall coverage</span>
          ) : (
            activeCamera.monitored_seats.map(seatId => (
              <span 
                key={seatId}
                className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700"
              >
                {seatId.toUpperCase()}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Active Person Tracks Observed in this Perspective */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium flex items-center space-x-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>Detected Entities in Angle</span>
          </span>
          <span className="text-[10px] font-mono text-cyan-400 font-semibold">
            {tracks.length} Tracks
          </span>
        </div>

        {tracks.length === 0 ? (
          <div className="p-2.5 rounded bg-slate-950/50 border border-slate-800/60 text-[11px] text-slate-500 text-center">
            No candidates currently in this camera&apos;s field of view.
          </div>
        ) : (
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {tracks.map(t => {
              const student = students.find(s => s.id === t.associated_student_id);
              return (
                <div 
                  key={t.track_id}
                  className="p-1.5 rounded bg-slate-950 border border-slate-800 text-[11px] flex items-center justify-between font-mono"
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    <span className="text-cyan-400 font-bold">{t.track_id}</span>
                    {student && (
                      <span className="text-slate-300 truncate">
                        • {student.name}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-500 text-[10px]">
                    {(t.confidence * 100).toFixed(0)}% Conf
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Multi-Camera Proctoring Protocol Note */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3 text-[11px] text-slate-400 space-y-1.5">
        <div className="flex items-center space-x-1.5 text-cyan-400 font-semibold text-xs">
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Focused Inspection Mode</span>
        </div>
        <p className="leading-relaxed text-[11px] text-slate-400">
          Showing 1 primary camera angle at a time to maximize display clarity and prevent screen clutter. All background camera trackers remain synchronized.
        </p>
      </div>

    </div>
  );
}
