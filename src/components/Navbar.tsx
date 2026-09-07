/**
 * Smart Classroom Exam Monitoring System
 * Main Navigation Bar
 */

import React from 'react';
import { useMonitoring } from '../context/MonitoringContext.js';
import { 
  ShieldCheck, 
  Video, 
  FileText, 
  Settings, 
  Radio, 
  AlertTriangle,
  Clock
} from 'lucide-react';

interface NavbarProps {
  currentView: 'player' | 'timeline' | 'reports' | 'admin';
  onNavigate: (view: 'player' | 'timeline' | 'reports' | 'admin') => void;
}

export function Navbar({ currentView, onNavigate }: NavbarProps) {
  const { settings, isConnected, stats, session } = useMonitoring();

  const appName = settings?.app_name || 'Smart Classroom Exam Monitoring System';
  const logoText = settings?.app_logo_text || 'PROCTOR-CV';
  const classroomTitle = settings?.classroom_display_title || (session?.title ? session.title : 'Live Examination Surveillance');

  return (
    <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Classroom Identification */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onNavigate('player')}>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-base tracking-tight">{logoText}</span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-[180px] xs:max-w-[240px] sm:max-w-xs">{classroomTitle}</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => onNavigate('player')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                currentView === 'player'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Live Player</span>
            </button>

            <button
              onClick={() => onNavigate('timeline')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                currentView === 'timeline'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Activity Log</span>
              {stats.active_alerts > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              )}
            </button>

            <button
              onClick={() => onNavigate('reports')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                currentView === 'reports'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Audit Reports</span>
            </button>
          </nav>

          {/* Live Status Badge */}
          <div className="flex items-center space-x-3">
            {/* Live Gateway Indicator */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[11px] font-mono font-medium text-slate-300">
                {isConnected ? 'GATEWAY LIVE' : 'CONNECTING'}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-[11px] font-mono text-cyan-400">{stats.processing_fps} FPS</span>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
