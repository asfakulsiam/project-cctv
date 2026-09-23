/**
 * src/components/Navbar.tsx - Application Navigation Header Component
 * Fully responsive across mobile (320px+) to desktop (1440px+).
 * Supports Light / Dark / System theming, mobile drawer menu, accessible keyboard focus,
 * and seamless interactive controls with explicit cursor-pointer states.
 */
import React, { useState } from 'react';
import {
  Video,
  Activity,
  Users,
  Shield,
  Radio,
  RefreshCw,
  Download,
  Menu,
  X,
  Sliders,
} from 'lucide-react';
import { SystemDiagnostics, CameraSource } from '../types.js';
import { ThemeToggle } from './ThemeToggle.js';

interface NavbarProps {
  currentTab: 'player' | 'activities' | 'candidates' | 'admin';
  setCurrentTab: (tab: 'player' | 'activities' | 'candidates' | 'admin') => void;
  diagnostics: SystemDiagnostics | null;
  cameras: CameraSource[];
  selectedCameraId: string;
  onSelectCamera: (id: string) => void;
  onRefresh: () => void;
  appName: string;
  candidateCount?: number;
  onOpenExport?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  diagnostics,
  cameras,
  selectedCameraId,
  onSelectCamera,
  onRefresh,
  appName,
  candidateCount = 0,
  onOpenExport,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isOnline = diagnostics?.cvWorkerStatus === 'online';
  const activeWarnings = diagnostics?.activeWarnings || 0;
  const activeTracks = diagnostics?.activeTracks || 0;
  const displayCandidateCount = candidateCount > 0 ? candidateCount : activeTracks;

  const handleTabClick = (tab: 'player' | 'activities' | 'candidates' | 'admin') => {
    setCurrentTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 transition-colors backdrop-blur-md border-b bg-white/90 border-neutral-200 text-neutral-900 dark:bg-neutral-900/95 dark:border-neutral-800 dark:text-neutral-100">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Logo & Application Title */}
        <button
          type="button"
          onClick={() => handleTabClick('player')}
          className="cursor-pointer flex items-center gap-2.5 min-w-0 shrink text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 rounded-lg p-0.5"
          title="Return to Live Monitor"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shadow-inner shrink-0 bg-neutral-100 border border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-xs sm:text-sm font-semibold tracking-tight truncate text-neutral-900 dark:text-white max-w-[140px] xs:max-w-[200px] sm:max-w-none">
                {appName}
              </h1>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700">
                CCTV-AI
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 font-normal leading-tight hidden md:block">
              Exam Hall Supervision & Activity Assistant
            </p>
          </div>
        </button>

        {/* Desktop Navigation Tabs (Segmented pill control) */}
        <nav
          aria-label="Main Navigation"
          className="hidden md:flex items-center p-1 rounded-xl border shadow-inner shrink-0 bg-neutral-100/90 border-neutral-200 dark:bg-neutral-950/80 dark:border-neutral-800"
        >
          <button
            type="button"
            onClick={() => handleTabClick('player')}
            className={`cursor-pointer flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
              currentTab === 'player'
                ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-900/50'
            }`}
          >
            <Video className="w-3.5 h-3.5 shrink-0" />
            <span>Live Monitor</span>
            <span
              className={`inline-flex items-center justify-center min-w-[1.5rem] h-4.5 px-1 rounded-full text-[10px] font-mono tabular-nums shrink-0 transition-colors ${
                activeTracks > 0
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700/60'
                  : 'bg-neutral-200 text-neutral-600 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700'
              }`}
            >
              {activeTracks > 99 ? '99+' : activeTracks}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabClick('activities')}
            className={`cursor-pointer flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
              currentTab === 'activities'
                ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-900/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>Activities</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabClick('candidates')}
            className={`cursor-pointer flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
              currentTab === 'candidates'
                ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-900/50'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Candidates</span>
            <span
              className={`inline-flex items-center justify-center min-w-[1.5rem] h-4.5 px-1 rounded-full text-[10px] font-mono tabular-nums shrink-0 transition-colors ${
                activeWarnings > 0
                  ? 'bg-red-600 text-white font-semibold animate-pulse'
                  : displayCandidateCount > 0
                  ? 'bg-neutral-300 text-neutral-800 font-semibold dark:bg-neutral-700 dark:text-neutral-100'
                  : 'bg-neutral-200 text-neutral-600 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700'
              }`}
            >
              {displayCandidateCount > 99 ? '99+' : displayCandidateCount}
            </span>
          </button>
        </nav>

        {/* Right Status Actions, Theme Switcher & Mobile Menu Trigger */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Camera Quick Selector (Large screens) */}
          {cameras.length > 0 && (
            <div className="hidden xl:flex items-center">
              <select
                aria-label="Quick Camera Selector"
                value={selectedCameraId}
                onChange={(e) => onSelectCamera(e.target.value)}
                className="cursor-pointer rounded-lg px-2.5 py-1 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-100 border border-neutral-300 text-neutral-800 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-200"
              >
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Export Report Button */}
          {onOpenExport && (
            <button
              type="button"
              onClick={onOpenExport}
              title="Export exam activity log and candidate scores (CSV/JSON)"
              className="cursor-pointer hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh feed and candidate data"
            className="cursor-pointer p-1.5 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 border border-transparent dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Theme Switcher Toggle */}
          <ThemeToggle />

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            className="cursor-pointer md:hidden p-1.5 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b px-4 py-3 space-y-2 transition-all bg-white border-neutral-200 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100 animate-in fade-in slide-in-from-top-2">
          
          {/* Mobile Camera Selection */}
          {cameras.length > 0 && (
            <div className="pb-2 mb-2 border-b border-neutral-200 dark:border-neutral-800">
              <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
                Active Camera Feed
              </label>
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  onSelectCamera(e.target.value);
                  setMobileMenuOpen(false);
                }}
                className="w-full cursor-pointer rounded-lg px-3 py-2 text-xs bg-neutral-100 border border-neutral-300 text-neutral-800 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-200"
              >
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name} ({cam.location || cam.sourceType})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Navigation Links */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleTabClick('player')}
              className={`cursor-pointer flex items-center justify-between p-2.5 rounded-xl text-xs font-medium transition-colors ${
                currentTab === 'player'
                  ? 'bg-neutral-900 text-white font-semibold dark:bg-neutral-800 dark:text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-emerald-500" />
                <span>Live Monitor</span>
              </div>
              <span className="font-mono text-[11px] font-semibold">{activeTracks}</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabClick('activities')}
              className={`cursor-pointer flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium transition-colors ${
                currentTab === 'activities'
                  ? 'bg-neutral-900 text-white font-semibold dark:bg-neutral-800 dark:text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              <Activity className="w-4 h-4 text-blue-500" />
              <span>Activities</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabClick('candidates')}
              className={`cursor-pointer flex items-center justify-between p-2.5 rounded-xl text-xs font-medium transition-colors ${
                currentTab === 'candidates'
                  ? 'bg-neutral-900 text-white font-semibold dark:bg-neutral-800 dark:text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-500" />
                <span>Candidates</span>
              </div>
              <span className="font-mono text-[11px] font-semibold">{displayCandidateCount}</span>
            </button>
          </div>

          {/* Mobile Export action */}
          {onOpenExport && (
            <button
              type="button"
              onClick={() => {
                onOpenExport();
                setMobileMenuOpen(false);
              }}
              className="cursor-pointer w-full flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-medium transition-colors bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40"
            >
              <Download className="w-4 h-4" />
              <span>Export Roster & Activity Log</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
};
