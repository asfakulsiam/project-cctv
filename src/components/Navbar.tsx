/**
 * Apple Human Interface Guidelines Navigation Bar
 * Translucent frosted glass, system typography, segmented control navigation,
 * real-time gateway telemetry indicator, and dynamic theme switcher.
 */

import React from 'react';
import { useMonitoring } from '../context/MonitoringContext.js';
import { useTheme } from '../hooks/useTheme.js';
import { 
  ShieldCheck, 
  Video, 
  FileText, 
  Radio, 
  Sun, 
  Moon
} from 'lucide-react';

interface NavbarProps {
  currentView: 'player' | 'timeline' | 'reports';
  onNavigate: (view: 'player' | 'timeline' | 'reports') => void;
}

export function Navbar({ currentView, onNavigate }: NavbarProps) {
  const { settings, isConnected, stats, session } = useMonitoring();
  const { resolvedTheme, toggleTheme } = useTheme();

  const appName = settings?.app_name || 'Exam Hall Monitoring';
  const logoText = settings?.app_logo_text || 'Proctor Vision';
  const classroomTitle = settings?.classroom_display_title || (session?.title ? session.title : 'Surveillance');

  return (
    <header className="sticky top-0 z-40 bg-[var(--system-chrome-bg)] backdrop-blur-2xl border-b border-[var(--system-chrome-border)] pt-safe transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Identity */}
          <div
            className="flex items-center space-x-3 cursor-pointer select-none group"
            onClick={() => onNavigate('player')}
          >
            <div className="w-9 h-9 rounded-[10px] bg-[var(--system-accent)] flex items-center justify-center text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[15px] font-semibold text-[var(--system-text-primary)] tracking-tight">
                  {logoText}
                </span>
              </div>
              <p className="text-[12px] text-[var(--system-text-secondary)] truncate max-w-[180px] xs:max-w-[240px] sm:max-w-xs">
                {classroomTitle}
              </p>
            </div>
          </div>

          {/* Center Navigation - Apple Segmented Control (Desktop) */}
          <nav className="hidden md:flex items-center bg-[var(--system-fill)] p-1 rounded-[12px] border border-[var(--system-chrome-border)]">
            <button
              onClick={() => onNavigate('player')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-[9px] text-[13px] font-medium transition-all cursor-pointer ${
                currentView === 'player'
                  ? 'bg-[var(--system-secondary-bg)] text-[var(--system-text-primary)] shadow-sm font-semibold'
                  : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)]'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Live Feed</span>
            </button>

            <button
              onClick={() => onNavigate('timeline')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-[9px] text-[13px] font-medium transition-all cursor-pointer ${
                currentView === 'timeline'
                  ? 'bg-[var(--system-secondary-bg)] text-[var(--system-text-primary)] shadow-sm font-semibold'
                  : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)]'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Activity Log</span>
              {stats.active_alerts > 0 && (
                <span className="w-2 h-2 rounded-full bg-[var(--system-warning)] animate-ping" />
              )}
            </button>

            <button
              onClick={() => onNavigate('reports')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-[9px] text-[13px] font-medium transition-all cursor-pointer ${
                currentView === 'reports'
                  ? 'bg-[var(--system-secondary-bg)] text-[var(--system-text-primary)] shadow-sm font-semibold'
                  : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Audit Reports</span>
            </button>
          </nav>

          {/* Right Status Controls & Theme Switcher */}
          <div className="flex items-center space-x-2.5">
            {/* Live Gateway Pill */}
            <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-[var(--system-fill)] border border-[var(--system-chrome-border)]">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[var(--system-success)] animate-pulse' : 'bg-[var(--system-destructive)]'}`} />
              <span className="text-[11px] font-mono-apple font-medium text-[var(--system-text-secondary)]">
                {isConnected ? 'GATEWAY LIVE' : 'CONNECTING'}
              </span>
            </div>

            {/* Theme Toggle Button (Light / Dark) */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle Light/Dark Theme"
              className="w-9 h-9 rounded-[10px] bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] border border-[var(--system-chrome-border)] flex items-center justify-center text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] transition-all cursor-pointer"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
