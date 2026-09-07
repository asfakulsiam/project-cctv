/**
 * Smart Classroom Exam Monitoring System
 * Live Statistics Bar Component
 * 
 * Displays live counters and system metrics generated directly
 * from the running multi-camera computer vision engine.
 */

import React from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { 
  Users, 
  Video, 
  Activity, 
  AlertTriangle, 
  ShieldAlert, 
  Cpu,
  UserCheck
} from 'lucide-react';

export function LiveStatisticsBar() {
  const { stats, cameras, students } = useMonitoring();

  const flaggedStudents = students.filter(s => s.unified_suspicion_score >= 60).length;
  const warningStudents = students.filter(s => s.unified_suspicion_score >= 35 && s.unified_suspicion_score < 60).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      
      {/* 1. Camera Network */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Cameras</span>
          <Video className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-bold font-mono text-white">{stats.online_cameras}</span>
          <span className="text-xs font-mono text-slate-500">/ {stats.total_cameras} online</span>
        </div>
        <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
          <div 
            className="bg-cyan-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${(stats.online_cameras / Math.max(1, stats.total_cameras)) * 100}%` }}
          />
        </div>
      </div>

      {/* 2. Detected Persons / Tracks */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Detected Subjects</span>
          <Users className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-bold font-mono text-white">{stats.detected_persons}</span>
          <span className="text-xs text-slate-500">active tracks</span>
        </div>
        <span className="text-[10px] text-slate-400 mt-2 truncate">
          Across all camera pools
        </span>
      </div>

      {/* 3. Present Students */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Present Students</span>
          <UserCheck className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-bold font-mono text-emerald-400">{stats.present_students}</span>
          <span className="text-xs text-slate-500">/ {students.length} enrolled</span>
        </div>
        <span className="text-[10px] text-emerald-500/80 mt-2 font-mono">
          Unified Identity Verified
        </span>
      </div>

      {/* 4. Active Behavioral Movement */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Movement Status</span>
          <Activity className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-bold font-mono text-amber-400">{stats.students_moving}</span>
          <span className="text-xs text-slate-500">active motion</span>
        </div>
        <span className="text-[10px] text-slate-400 mt-2">
          Head turn or pose shift
        </span>
      </div>

      {/* 5. Warning & High Alerts */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Suspicion Alerts</span>
          <ShieldAlert className={`w-4 h-4 ${flaggedStudents > 0 ? 'text-rose-500' : 'text-slate-500'}`} />
        </div>
        <div className="flex items-baseline space-x-2">
          <span className={`text-xl font-bold font-mono ${flaggedStudents > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
            {flaggedStudents}
          </span>
          <span className="text-xs text-slate-500">high</span>
          <span className="text-slate-700">/</span>
          <span className="text-sm font-bold font-mono text-amber-400">{warningStudents}</span>
          <span className="text-xs text-slate-500">warn</span>
        </div>
        <span className="text-[10px] text-slate-400 mt-2 font-mono">
          Threshold &gt;= 60 pts
        </span>
      </div>

      {/* 6. Processing FPS & Engine Latency */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Engine Health</span>
          <Cpu className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-bold font-mono text-cyan-400">{stats.processing_fps}</span>
          <span className="text-xs font-mono text-slate-500">FPS / ~35ms</span>
        </div>
        <div className="flex items-center space-x-1.5 mt-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-400 uppercase">{stats.system_health}</span>
        </div>
      </div>

    </div>
  );
}
