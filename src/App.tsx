/**
 * Apple Human Interface Guidelines - Exam Monitoring Application
 * Main Application Shell & Route Controller
 *
 * Strict Isolation:
 * - Admin console is dynamically loaded via React.lazy() and code-split into a separate chunk.
 * - Public navigation contains NO references, links, buttons, or shortcuts to Admin.
 * - Admin route is exclusively under /admin/*.
 * - Fluid Apple HIG design tokens, frosted glass navbars, and responsive mobile tab bar.
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { MonitoringProvider, useMonitoring } from './context/MonitoringContext.js';
import { Navbar } from './components/Navbar.js';
import { Footer } from './components/Footer.js';
import { MobileTabBar } from './components/MobileTabBar.js';
import { MainVideoPlayer } from './components/LivePlayer/MainVideoPlayer.js';
import { CameraButtonsBar } from './components/LivePlayer/CameraButtonsBar.js';
import { ActiveCameraDetailsPanel } from './components/LivePlayer/ActiveCameraDetailsPanel.js';
import { LiveStatisticsBar } from './components/LivePlayer/LiveStatisticsBar.js';
import { ActivityTimeline } from './components/LivePlayer/ActivityTimeline.js';
import { StudentInspectionDrawer } from './components/LivePlayer/StudentInspectionDrawer.js';
import { AuditReportsView } from './components/Reports/AuditReportsView.js';
import { Card } from './components/ui/Card.js';
import { Badge } from './components/ui/Badge.js';
import { Skeleton } from './components/ui/Skeleton.js';
import { Users, Lock, ArrowLeft } from 'lucide-react';

// Code-split AdminLayout so admin code & strings are isolated in their own chunk
const AdminLayout = lazy(() =>
  import('./components/Admin/AdminLayout.js').then(module => ({
    default: module.AdminLayout
  }))
);

export type AppView = 'player' | 'timeline' | 'reports' | 'admin';

const getInitialView = (): AppView => {
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/timeline')) return 'timeline';
  if (path.startsWith('/reports')) return 'reports';
  return 'player';
};

function MonitoringAppContent() {
  const [currentView, setCurrentView] = useState<AppView>(getInitialView);
  const { 
    students, 
    selectedStudent, 
    setSelectedStudent 
  } = useMonitoring();

  // URL-synchronized navigation handler
  const navigate = (view: AppView) => {
    setCurrentView(view);
    const targetPath = view === 'player' ? '/' : `/${view}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  };

  // Browser back/forward history listener
  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(getInitialView());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleInspectStudent = (studentId: string) => {
    const s = students.find(item => item.id === studentId);
    if (s) setSelectedStudent(s);
  };

  return (
    <div className="min-h-screen bg-[var(--system-bg)] text-[var(--system-text-primary)] flex flex-col font-sans-apple transition-colors">
      
      {/* Top Navigation - ONLY displayed on standard surveillance views (Not on separate /admin route) */}
      {currentView !== 'admin' ? (
        <Navbar currentView={currentView} onNavigate={navigate} />
      ) : (
        /* Standalone Admin Header Bar */
        <header className="bg-[var(--system-chrome-bg)] border-b border-[var(--system-chrome-border)] backdrop-blur-xl sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-[8px] bg-[var(--system-accent)] flex items-center justify-center text-white shadow-sm">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-[14px] text-[var(--system-text-primary)]">
                    Administration Console
                  </span>
                </div>
              </div>

              <button
                onClick={() => navigate('player')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-[9px] bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] text-[var(--system-text-primary)] text-[12px] font-medium transition-colors border border-[var(--system-chrome-border)] cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Live</span>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 md:pb-8">
        
        {/* VIEW 1: SINGLE CAMERA PLAYER MONITORING */}
        {currentView === 'player' && (
          <div className="space-y-6">
            
            {/* Camera Switcher Buttons Bar */}
            <CameraButtonsBar />

            {/* Single Camera View Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Main Single Camera Video Player (2 cols) */}
              <div className="lg:col-span-2 flex flex-col space-y-3">
                <MainVideoPlayer onInspectStudent={handleInspectStudent} />
              </div>

              {/* Active Camera Perspective Details & Telemetry (1 col) */}
              <div className="lg:col-span-1 flex flex-col space-y-4">
                <ActiveCameraDetailsPanel onInspectStudent={handleInspectStudent} />
              </div>

            </div>

            {/* Live Statistics Counters Bar */}
            <LiveStatisticsBar />

            {/* Bottom Row: Activity Timeline & Candidates Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Activity Timeline (2 Columns) */}
              <div className="lg:col-span-2">
                <ActivityTimeline onInspectStudent={handleInspectStudent} />
              </div>

              {/* Candidates Roster Card (1 Column) */}
              <Card padding="none" className="lg:col-span-1 flex flex-col overflow-hidden">
                <div className="p-3.5 bg-[var(--system-chrome-bg)] backdrop-blur-md border-b border-[var(--system-chrome-border)] flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-[var(--system-accent)]" />
                    <h3 className="text-[13px] font-semibold text-[var(--system-text-primary)]">
                      Exam Candidates ({students.length})
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono-apple text-[var(--system-text-tertiary)]">
                    Tap to Inspect
                  </span>
                </div>

                <div className="p-2 divide-y divide-[var(--system-separator)] max-h-[380px] overflow-y-auto">
                  {students.length === 0 ? (
                    <div className="p-8 text-center text-[12px] text-[var(--system-text-tertiary)] space-y-1">
                      <Users className="w-7 h-7 mx-auto text-[var(--system-text-quaternary)]" />
                      <p className="font-semibold text-[var(--system-text-secondary)]">No Candidates Enrolled</p>
                      <p className="text-[11px]">Enrolled candidate records will appear here.</p>
                    </div>
                  ) : (
                    students.map(student => {
                      const isHigh = student.unified_suspicion_score >= 60;
                      const isWarn = student.unified_suspicion_score >= 35 && !isHigh;

                      return (
                        <div
                          key={student.id}
                          onClick={() => setSelectedStudent(student)}
                          className="p-2.5 rounded-[12px] hover:bg-[var(--system-fill-secondary)] cursor-pointer transition-colors flex items-center justify-between space-x-3 text-[12px]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-[var(--system-text-primary)] truncate">
                                {student.name}
                              </span>
                              <span className="text-[10px] font-mono-apple text-[var(--system-text-tertiary)]">
                                ({student.seat_id?.toUpperCase() || 'Desk'})
                              </span>
                            </div>

                            <div className="flex items-center space-x-2 mt-0.5 text-[11px] text-[var(--system-text-tertiary)] font-mono-apple">
                              <span>ID: {student.student_id_number}</span>
                              <span>•</span>
                              <span className="text-[var(--system-accent)]">
                                {student.active_observations.length} Cam{student.active_observations.length === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>

                          {/* Suspicion Pill */}
                          <div className="text-right flex-shrink-0">
                            <Badge variant={isHigh ? 'destructive' : isWarn ? 'warning' : 'secondary'}>
                              {student.unified_suspicion_score} pts
                            </Badge>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>

            </div>

          </div>
        )}

        {/* VIEW 2: FULL-PAGE ACTIVITY TIMELINE */}
        {currentView === 'timeline' && (
          <div className="space-y-6">
            <Card padding="md">
              <h1 className="text-[22px] font-semibold text-[var(--system-text-primary)] tracking-tight">
                Full Examination Activity Stream
              </h1>
              <p className="text-[13px] text-[var(--system-text-secondary)] mt-0.5">
                Chronological log of computer-vision events, movements, and alerts.
              </p>
            </Card>
            <ActivityTimeline onInspectStudent={handleInspectStudent} maxEvents={100} />
          </div>
        )}

        {/* VIEW 3: AUDIT & EXPORT REPORTS */}
        {currentView === 'reports' && (
          <AuditReportsView />
        )}

        {/* VIEW 4: SEPARATE PROTECTED ADMIN ROUTE (/admin) */}
        {currentView === 'admin' && (
          <Suspense fallback={
            <div className="space-y-4 p-8">
              <Skeleton className="h-12 w-1/3 rounded-[12px]" />
              <Skeleton className="h-80 w-full rounded-[20px]" />
            </div>
          }>
            <AdminLayout onExitAdmin={() => navigate('player')} />
          </Suspense>
        )}

      </main>

      {/* Selected Student Cross-Camera Inspection Drawer */}
      {selectedStudent && (
        <StudentInspectionDrawer 
          student={selectedStudent} 
          onClose={() => setSelectedStudent(null)} 
        />
      )}

      {/* Global Application Footer */}
      <Footer onNavigate={navigate} />

      {/* Mobile-first Apple Cupertino Bottom Tab Bar */}
      {currentView !== 'admin' && (
        <MobileTabBar currentView={currentView} onNavigate={navigate} />
      )}

    </div>
  );
}

export default function App() {
  return (
    <MonitoringProvider>
      <MonitoringAppContent />
    </MonitoringProvider>
  );
}
