/**
 * Smart Classroom Exam Monitoring System
 * Global Application Footer
 * 
 * CORE REQUIREMENT:
 * - Provides system credentials, multi-camera telemetry, and technical specifications.
 * - Provides discreet, protected route link to the Administrator Portal (/admin).
 */

import React from 'react';
import { useMonitoring } from '../context/MonitoringContext.js';
import { 
  Database, 
  Cpu, 
  ShieldCheck, 
  Lock, 
  Video, 
  Radio, 
  FileText,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface FooterProps {
  onNavigate?: (view: 'player' | 'timeline' | 'reports' | 'admin') => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const { stats, cameras, settings } = useMonitoring();

  const handleRouteClick = (view: 'player' | 'timeline' | 'reports' | 'admin', e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate(view);
    } else {
      const target = view === 'player' ? '/' : `/${view}`;
      window.history.pushState(null, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <footer className="bg-slate-950 border-t border-slate-800/80 text-xs text-slate-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Top Tier: System Identity & Direct Route Navigation */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-900">
          
          {/* System Identity */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-200 text-sm tracking-tight">
                {settings?.app_name || 'Smart Classroom Exam Monitoring System'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-mono border border-slate-800">
                v1.2 IEEE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 max-w-lg">
              Computer Vision & Multi-Camera Behavioral Analysis Platform for automated academic integrity surveillance.
            </p>
          </div>

          {/* Quick Route Navigation Links (Includes /admin) */}
          <div className="flex flex-wrap items-center gap-2 font-medium text-xs">
            <a
              href="/"
              onClick={(e) => handleRouteClick('player', e)}
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors flex items-center space-x-1.5"
            >
              <Video className="w-3.5 h-3.5 text-cyan-400" />
              <span>Live Player</span>
            </a>

            <a
              href="/timeline"
              onClick={(e) => handleRouteClick('timeline', e)}
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors flex items-center space-x-1.5"
            >
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span>Activity Log</span>
            </a>

            <a
              href="/reports"
              onClick={(e) => handleRouteClick('reports', e)}
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors flex items-center space-x-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Audit Reports</span>
            </a>

            {/* Administrator Portal Link */}
            <a
              href="/admin"
              onClick={(e) => handleRouteClick('admin', e)}
              className="px-3 py-1.5 rounded-md bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 hover:text-indigo-100 border border-indigo-800/40 transition-colors flex items-center space-x-1.5"
              title="Protected System Administration Console"
            >
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Admin Portal (/admin)</span>
            </a>
          </div>

        </div>

        {/* Bottom Tier: Telemetry & Standards Compliance */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-slate-400">
          
          {/* Telemetry counters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-1.5 text-slate-300">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>MongoDB Document Storage</span>
            </div>
            <span className="text-slate-800">•</span>
            <div className="flex items-center space-x-1.5 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>{cameras.length} Camera Angle Trackers</span>
            </div>
            <span className="text-slate-800">•</span>
            <div className="flex items-center space-x-1.5 text-slate-300">
              <span>Engine Health:</span>
              <span className="text-emerald-400 font-bold">{stats.system_health.toUpperCase()}</span>
            </div>
          </div>

          {/* Privacy & Academic Compliance */}
          <div className="text-slate-400 text-center sm:text-right text-[10px]">
            Academic Integrity Compliant • Single Camera Inspection View • Real-time ByteTrack Ingestion
          </div>

        </div>

      </div>
    </footer>
  );
}
