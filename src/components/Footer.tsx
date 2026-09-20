/**
 * Apple Human Interface Guidelines Application Footer
 * Minimalist, informative footer displaying system health, academic integrity standards,
 * and multi-camera telemetry metrics.
 * 
 * NOTE: In compliance with strict administrative isolation, no admin links, buttons,
 * or shortcut indicators are exposed in the user interface.
 */

import React from 'react';
import { useMonitoring } from '../context/MonitoringContext.js';
import { 
  ShieldCheck, 
  Video, 
  Radio, 
  FileText,
  Activity,
  Cpu
} from 'lucide-react';

interface FooterProps {
  onNavigate?: (view: 'player' | 'timeline' | 'reports') => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const { stats, cameras, settings } = useMonitoring();

  const handleRouteClick = (view: 'player' | 'timeline' | 'reports', e: React.MouseEvent) => {
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
    <footer className="border-t border-[var(--system-separator)] bg-[var(--system-secondary-bg)] text-[var(--system-text-secondary)] mt-auto pb-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Top Tier: System Identity & Navigation */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-[var(--system-separator)]">
          
          {/* Identity */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-[6px] bg-[var(--system-accent-subtle)] flex items-center justify-center text-[var(--system-accent)]">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="font-semibold text-[var(--system-text-primary)] text-[14px] tracking-tight">
                {settings?.app_name || 'Smart Classroom Exam Monitoring System'}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--system-fill)] text-[var(--system-text-tertiary)] font-mono-apple">
                v1.2 IEEE
              </span>
            </div>
            <p className="text-[12px] text-[var(--system-text-tertiary)] max-w-lg">
              Computer Vision & Multi-Camera Behavioral Analysis Platform for automated academic integrity surveillance.
            </p>
          </div>

          {/* Quick Route Navigation Links (Clean user-facing only) */}
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <a
              href="/"
              onClick={(e) => handleRouteClick('player', e)}
              className="px-3 py-1.5 rounded-[10px] bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] text-[var(--system-text-primary)] transition-colors flex items-center space-x-1.5"
            >
              <Video className="w-3.5 h-3.5 text-[var(--system-accent)]" />
              <span>Live Feed</span>
            </a>

            <a
              href="/timeline"
              onClick={(e) => handleRouteClick('timeline', e)}
              className="px-3 py-1.5 rounded-[10px] bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] text-[var(--system-text-primary)] transition-colors flex items-center space-x-1.5"
            >
              <Radio className="w-3.5 h-3.5 text-[var(--system-info)]" />
              <span>Activity Log</span>
            </a>

            <a
              href="/reports"
              onClick={(e) => handleRouteClick('reports', e)}
              className="px-3 py-1.5 rounded-[10px] bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] text-[var(--system-text-primary)] transition-colors flex items-center space-x-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--system-success)]" />
              <span>Audit Reports</span>
            </a>
          </div>

        </div>

        {/* Bottom Tier: Telemetry Status & Ethical Standards */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-[var(--system-text-tertiary)]">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-[var(--system-success)]" />
              <span>Surveillance Engine Active ({cameras.length} feeds configured)</span>
            </span>
            <span>•</span>
            <span>Zero Student Identity Tracking Loss</span>
          </div>

          <div>
            <span>Compliant with IEEE Academic Integrity & Privacy Standards</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
