/**
 * Smart Classroom Exam Monitoring System
 * Camera Switcher Buttons Bar
 * 
 * CORE REQUIREMENT:
 * - Shows only 1 single camera in the main view at any time.
 * - Other cameras are presented as interactive switch buttons (e.g. Camera 1, Camera 2, Camera 3).
 * - Clicking a camera button instantly switches the single camera player to that feed.
 */

import React from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { Video, Star, CheckCircle2, Shield, Eye } from 'lucide-react';

export function CameraButtonsBar() {
  const { 
    cameras, 
    focusedCameraId, 
    setFocusedCameraId, 
    primaryCameraId,
    tracksByCamera 
  } = useMonitoring();

  if (cameras.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-center text-slate-500 text-xs">
        <Video className="w-5 h-5 mx-auto mb-1.5 text-slate-600" />
        <span className="font-semibold text-slate-400">No Surveillance Feeds Registered</span>
        <p className="text-[11px] text-slate-500 mt-0.5">Register camera streams in the Admin panel to enable multi-camera switching.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5 px-1">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Video className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Camera Angles ({cameras.length})
            </h3>
            <p className="text-[11px] text-slate-400">
              Single-feed view active. Click any camera button to switch live perspective.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>All Streams Ingesting</span>
          </span>
        </div>
      </div>

      {/* Interactive Camera Selection Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
        {cameras.map(cam => {
          const isActive = cam.camera_id === focusedCameraId;
          const isPrimary = cam.camera_id === primaryCameraId;
          const trackCount = tracksByCamera[cam.camera_id]?.length || 0;
          const isOnline = cam.status === 'online' && cam.enabled !== false;

          return (
            <button
              key={cam.camera_id}
              onClick={() => setFocusedCameraId(cam.camera_id)}
              className={`group relative flex items-center justify-between p-3 rounded-lg border text-left transition-all duration-200 ${
                isActive
                  ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-md shadow-cyan-500/10 ring-1 ring-cyan-500/40'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-800/70 text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                {/* Status Dot / Icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  isActive 
                    ? 'bg-cyan-500 text-slate-950 font-bold' 
                    : 'bg-slate-800 text-slate-400 group-hover:text-white group-hover:bg-slate-700'
                }`}>
                  <Video className="w-4 h-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-xs truncate">
                      {cam.name}
                    </span>
                    {isPrimary && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 flex items-center space-x-0.5">
                        <Star className="w-2.5 h-2.5 fill-amber-400" />
                        <span>Primary</span>
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {cam.view_angle_description || `${cam.source_type.toUpperCase()} Feed`}
                  </p>
                </div>
              </div>

              {/* Right Side Pill / Status */}
              <div className="flex flex-col items-end flex-shrink-0 ml-2">
                {isActive ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500 text-slate-950 uppercase tracking-wide flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Viewing</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 group-hover:text-cyan-400 group-hover:bg-cyan-950/50 border border-slate-700/60 transition-colors flex items-center space-x-1">
                    <Eye className="w-2.5 h-2.5" />
                    <span>Switch</span>
                  </span>
                )}
                
                <span className="text-[9px] font-mono text-slate-500 mt-1">
                  {isOnline ? `${cam.quality_score || 90}% Clarity` : 'Offline'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
