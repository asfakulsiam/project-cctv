/**
 * Smart Classroom Exam Monitoring System Using Computer Vision and Behavioral Analysis
 * Primary Application Component
 * 
 * CORE ARCHITECTURAL PRIORITIES:
 * - SINGLE CAMERA VIEW: Displays only 1 camera at a time in the player view.
 * - CAMERA BUTTONS: Other cameras are presented as interactive buttons (Camera 1, Camera 2, Camera 3).
 *   Clicking a button instantly switches the single camera view to that feed.
 * - SEPARATE ROUTES: Clean separation between public surveillance (/) and admin console (/admin).
 * - Admin panel removed from top navigation; accessible via direct /admin route or footer.
 * - Rich technical and academic compliance Footer across all views.
 */

import React, { useState, useEffect } from 'react';
import { MonitoringProvider, useMonitoring } from './context/MonitoringContext.js';
import { Navbar } from './components/Navbar.js';
import { Footer } from './components/Footer.js';
import { MainVideoPlayer } from './components/LivePlayer/MainVideoPlayer.js';
import { CameraButtonsBar } from './components/LivePlayer/CameraButtonsBar.js';
import { ActiveCameraDetailsPanel } from './components/LivePlayer/ActiveCameraDetailsPanel.js';
import { LiveStatisticsBar } from './components/LivePlayer/LiveStatisticsBar.js';
import { ActivityTimeline } from './components/LivePlayer/ActivityTimeline.js';
import { StudentInspectionDrawer } from './components/LivePlayer/StudentInspectionDrawer.js';
import { AuditReportsView } from './components/Reports/AuditReportsView.js';
import { AdminLayout } from './components/Admin/AdminLayout.js';
import { 
  Users, 
  ShieldCheck, 
  Sparkles,
  ArrowLeft,
  Lock
} from 'lucide-react';

const getInitialView = (): 'player' | 'timeline' | 'reports' | 'admin' => {
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/timeline')) return 'timeline';
  if (path.startsWith('/reports')) return 'reports';
  return 'player';
};

function MonitoringAppContent() {
  const [currentView, setCurrentView] = useState<'player' | 'timeline' | 'reports' | 'admin'>(getInitialView);
  const { 
    students, 
    selectedStudent, 
    setSelectedStudent,
    settings
  } = useMonitoring();

  // URL-synchronized navigation handler
  const navigate = (view: 'player' | 'timeline' | 'reports' | 'admin') => {
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-slate-950 font-sans">
      
      {/* Top Navigation - ONLY displayed on standard surveillance views (Not on separate /admin route) */}
      {currentView !== 'admin' ? (
        <Navbar currentView={currentView} onNavigate={navigate} />
      ) : (
        /* Dedicated Standalone Admin Top Banner */
        <header className="bg-slate-900/95 border-b border-indigo-900/50 backdrop-blur-md sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-sm">System Administration Console</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono border border-indigo-800/60">
                      /admin route
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => navigate('player')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Live Monitoring (/)</span>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* VIEW 1: SINGLE CAMERA PLAYER MONITORING (WITH CAMERA BUTTONS) */}
        {currentView === 'player' && (
          <div className="space-y-6">
            
            {/* Camera Switcher Buttons Bar: Camera 1, Camera 2, Camera 3... */}
            <CameraButtonsBar />

            {/* Single Camera View Grid: Only 1 active camera canvas rendered */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Main Single Camera Video Player (2 cols) */}
              <div className="lg:col-span-2 flex flex-col space-y-3">
                <MainVideoPlayer onInspectStudent={handleInspectStudent} />
              </div>

              {/* Active Camera Perspective Details & Telemetry (1 col) - No secondary video canvases */}
              <div className="lg:col-span-1 flex flex-col space-y-4">
                <ActiveCameraDetailsPanel />
              </div>

            </div>

            {/* Live Statistics Counters Bar */}
            <LiveStatisticsBar />

            {/* Bottom Row: Realtime Movement Activity Timeline & Student Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Live Movement Activity Timeline (Takes 2 Columns) */}
              <div className="lg:col-span-2">
                <ActivityTimeline onInspectStudent={handleInspectStudent} />
              </div>

              {/* Student Roster & Observation Coverage (Right Column) */}
              <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
                <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Exam Candidates ({students.length})
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    Click to Inspect
                  </span>
                </div>

                <div className="p-2 divide-y divide-slate-800/50 max-h-[380px] overflow-y-auto">
                  {students.length === 0 && (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      <Users className="w-8 h-8 mx-auto mb-2 text-slate-600 stroke-1" />
                      <p className="font-semibold text-slate-400">No Candidates Enrolled</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Add student records via the Admin route to monitor examination candidates.
                      </p>
                    </div>
                  )}
                  {students.map(student => {
                    const isHigh = student.unified_suspicion_score >= 60;
                    const isWarn = student.unified_suspicion_score >= 35 && !isHigh;

                    return (
                      <div
                        key={student.id}
                        onClick={() => setSelectedStudent(student)}
                        className="p-2.5 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors flex items-center justify-between space-x-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-semibold text-xs text-white truncate">
                              {student.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              ({student.seat_id?.toUpperCase() || 'Desk'})
                            </span>
                          </div>

                          <div className="flex items-center space-x-2 mt-0.5 text-[10px] text-slate-400 font-mono">
                            <span>ID: {student.student_id_number}</span>
                            <span>•</span>
                            <span className="text-cyan-400">
                              {student.active_observations.length} Cam{student.active_observations.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>

                        {/* Suspicion Pill */}
                        <div className="text-right flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            isHigh ? 'bg-rose-950 text-rose-400 border border-rose-800/40' :
                            isWarn ? 'bg-amber-950 text-amber-400 border border-amber-800/40' :
                            'bg-slate-800 text-slate-300'
                          }`}>
                            {student.unified_suspicion_score} pts
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* VIEW 2: FULL-PAGE ACTIVITY TIMELINE */}
        {currentView === 'timeline' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h1 className="text-xl font-bold text-white">Full Examination Activity Stream</h1>
                <p className="text-xs text-slate-400 mt-0.5">Comprehensive chronological log of computer-vision events, movements, and alerts.</p>
              </div>
            </div>
            <ActivityTimeline onInspectStudent={handleInspectStudent} maxEvents={100} />
          </div>
        )}

        {/* VIEW 3: AUDIT & EXPORT REPORTS */}
        {currentView === 'reports' && (
          <AuditReportsView />
        )}

        {/* VIEW 4: SEPARATE PROTECTED ADMIN ROUTE (/admin) */}
        {currentView === 'admin' && (
          <div className="space-y-4">
            <AdminLayout onExitAdmin={() => navigate('player')} />
          </div>
        )}

      </main>

      {/* Selected Student Cross-Camera Inspection Drawer */}
      {selectedStudent && (
        <StudentInspectionDrawer 
          student={selectedStudent} 
          onClose={() => setSelectedStudent(null)} 
        />
      )}

      {/* Global Application Footer with route links and telemetry */}
      <Footer onNavigate={navigate} />

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
