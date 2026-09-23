/**
 * src/App.tsx - React Application Root Component
 * Coordinates main application state, tab navigation (Live Monitor, Activities, Candidates, Admin),
 * REST API polling, real-time candidate score updates, and system health status.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar.js';
import { MainPlayer } from './components/MainPlayer.js';
import { ActivityPanel } from './components/ActivityPanel.js';
import { CandidateList } from './components/CandidateList.js';
import { AdminPanel } from './components/AdminPanel.js';
import { ExportModal } from './components/ExportModal.js';
import { visionDetector } from './services/realDetector.js';
import {
  CameraSource,
  Candidate,
  ActivityRecord,
  ActivityTypeConfig,
  ScoreThresholds,
  SystemDiagnostics,
} from './types.js';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'player' | 'activities' | 'candidates' | 'admin'>('player');
  const [cameras, setCameras] = useState<CameraSource[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<CameraSource | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityTypeConfig[]>([]);
  const [scoreThresholds, setScoreThresholds] = useState<ScoreThresholds>({
    normalMax: 35,
    warningMax: 70,
    highMin: 71,
  });
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [appName, setAppName] = useState<string>('Exam Hall Monitoring Assistant');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Helper for resilient fetching with retry
  const safeFetchJson = async <T,>(url: string, retries = 2): Promise<T | null> => {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          return (await res.json()) as T;
        }
      } catch {
        if (i < retries) {
          await new Promise((r) => setTimeout(r, 600 * (i + 1)));
        }
      }
    }
    return null;
  };

  // Fetch initial cameras
  const fetchCameras = useCallback(async () => {
    const data = await safeFetchJson<CameraSource[]>('/api/cameras');
    if (data && Array.isArray(data) && data.length > 0) {
      setCameras(data);
      if (!selectedCamera) {
        setSelectedCamera(data[0]);
      }
    } else {
      // Fallback default cameras if server is starting
      setCameras((prev) => {
        if (prev.length > 0) return prev;
        const defaults: CameraSource[] = [
          {
            id: 'cam-1',
            name: 'Main Exam Hall - Front View',
            location: 'Hall A (North)',
            sourceType: 'file',
            sourceUrl: '/assets/classroom.mp4',
            enabled: true,
            status: 'active',
            resolution: '1920x1080',
          },
          {
            id: 'cam-2',
            name: 'Exam Hall - Rear View',
            location: 'Hall A (South)',
            sourceType: 'file',
            sourceUrl: '/assets/camera2_hall.mp4',
            enabled: true,
            status: 'active',
            resolution: '1920x1080',
          },
        ];
        if (!selectedCamera) setSelectedCamera(defaults[0]);
        return defaults;
      });
    }
  }, [selectedCamera]);

  // Fetch candidates (pull active candidates by default or all)
  const fetchCandidates = useCallback(async (activeOnly = false) => {
    const url = activeOnly ? '/api/candidates?activeOnly=true' : '/api/candidates';
    const data = await safeFetchJson<Candidate[]>(url);
    if (data && Array.isArray(data)) {
      setCandidates(data);
    }
  }, []);

  // Fetch activity records
  const fetchActivities = useCallback(async () => {
    const data = await safeFetchJson<ActivityRecord[]>('/api/activities?limit=100');
    if (data && Array.isArray(data)) {
      setActivities(data);
    }
  }, []);

  // Clear all activities
  const handleClearActivities = async () => {
    try {
      const res = await fetch('/api/activities/clear', { method: 'POST' });
      if (res.ok) {
        setActivities([]);
        visionDetector.clearAllActivities();
        await fetchCandidates();
      }
    } catch (e: any) {
      console.warn('Failed to clear activities:', e?.message || String(e));
    }
  };

  // Delete individual activity
  const handleDeleteActivity = async (activityId: string) => {
    try {
      const res = await fetch(`/api/activities/${activityId}`, { method: 'DELETE' });
      if (res.ok) {
        setActivities((prev) => prev.filter((a) => a.id !== activityId));
        await fetchCandidates();
      }
    } catch (e: any) {
      console.warn('Failed to delete activity:', e?.message || String(e));
    }
  };

  // Fetch activity types config
  const fetchActivityTypes = useCallback(async () => {
    const data = await safeFetchJson<ActivityTypeConfig[]>('/api/activity-types');
    if (data && Array.isArray(data)) {
      setActivityTypes(data);
    }
  }, []);

  // Fetch score thresholds
  const fetchThresholds = useCallback(async () => {
    const data = await safeFetchJson<any>('/api/settings/thresholds');
    if (data) {
      setScoreThresholds({
        normalMax: data.normalMax ?? 35,
        warningMax: data.warningMax ?? 70,
        highMin: data.highMin ?? data.highWarningMin ?? 71,
      });
    }
  }, []);

  // Fetch system diagnostics
  const fetchDiagnostics = useCallback(async () => {
    const data = await safeFetchJson<SystemDiagnostics>('/api/diagnostics');
    if (data) {
      setDiagnostics(data);
    }
  }, []);

  // Fetch application settings
  const fetchSettings = useCallback(async () => {
    const data = await safeFetchJson<{ appName?: string }>('/api/settings');
    if (data && data.appName) {
      setAppName(data.appName);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await Promise.allSettled([
        fetchCameras(),
        fetchCandidates(),
        fetchActivities(),
        fetchActivityTypes(),
        fetchThresholds(),
        fetchDiagnostics(),
        fetchSettings(),
      ]);
      setIsInitializing(false);
    };
    init();
  }, [
    fetchCameras,
    fetchCandidates,
    fetchActivities,
    fetchActivityTypes,
    fetchThresholds,
    fetchDiagnostics,
    fetchSettings,
  ]);

  // Periodic health polling (every 4 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchDiagnostics();
    }, 4000);
    return () => clearInterval(timer);
  }, [fetchDiagnostics]);

  // URL Route Synchronization for /admin and tabs
  useEffect(() => {
    const syncRouteFromLocation = () => {
      const pathname = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();

      if (pathname === '/admin' || pathname.startsWith('/admin/') || hash === '#admin' || hash === '#/admin') {
        setCurrentTab('admin');
      } else if (pathname === '/candidates' || hash === '#candidates') {
        setCurrentTab('candidates');
      } else if (pathname === '/activities' || hash === '#activities') {
        setCurrentTab('activities');
      } else {
        setCurrentTab('player');
      }
    };

    syncRouteFromLocation();
    window.addEventListener('popstate', syncRouteFromLocation);
    window.addEventListener('hashchange', syncRouteFromLocation);
    return () => {
      window.removeEventListener('popstate', syncRouteFromLocation);
      window.removeEventListener('hashchange', syncRouteFromLocation);
    };
  }, []);

  const handleSetTab = (tab: 'player' | 'activities' | 'candidates' | 'admin') => {
    setCurrentTab(tab);
    if (tab === 'admin') {
      window.history.pushState({}, '', '/admin');
    } else if (tab === 'player') {
      window.history.pushState({}, '', '/');
    } else {
      window.history.pushState({}, '', `/${tab}`);
    }
  };

  // Candidate updates
  const handleUpdateCandidate = async (candidate: Candidate) => {
    const candidateId = candidate.id || (candidate as any).pId;
    try {
      const sanitized = {
        id: candidate.id,
        trackerId: candidate.trackerId,
        cameraId: candidate.cameraId,
        studentName: candidate.studentName,
        seatNumber: candidate.seatNumber,
        firstSeen: candidate.firstSeen,
        lastSeen: candidate.lastSeen,
        currentScore: candidate.currentScore,
        warningLevel: candidate.warningLevel,
        warningCleared: candidate.warningCleared,
        isCurrentlyTracked: candidate.isCurrentlyTracked,
        lastActivity: candidate.lastActivity,
        notes: candidate.notes,
        name: candidate.name,
      };

      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitized),
      });
      if (res.ok) {
        const updated = await res.json();
        setCandidates((prev) =>
          prev.map((c) => ((c.id || (c as any).pId) === candidateId ? updated : c))
        );
      }
    } catch (e: any) {
      console.warn('Failed to update candidate:', e?.message || String(e));
    }
  };

  // Clear warning for candidate
  const handleClearWarning = async (pId: string) => {
    if (selectedCamera) {
      visionDetector.clearScore(selectedCamera.id, pId);
    } else {
      cameras.forEach((cam) => visionDetector.clearScore(cam.id, pId));
    }
    try {
      const res = await fetch(`/api/candidates/${pId}/clear-warning`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.candidate) {
          setCandidates((prev) =>
            prev.map((c) => ((c.id || (c as any).pId) === pId ? data.candidate : c))
          );
        }
      }
    } catch (e: any) {
      console.warn('Failed to clear candidate warning:', e?.message || String(e));
    }
  };

  // Delete individual candidate
  const handleDeleteCandidate = async (candidateId: string) => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, { method: 'DELETE' });
      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => (c.id || (c as any).pId) !== candidateId));
      }
    } catch (e: any) {
      console.warn('Failed to delete candidate:', e?.message || String(e));
    }
  };

  // Clear / Delete all candidates
  const handleClearCandidates = async () => {
    try {
      const res = await fetch('/api/candidates', { method: 'DELETE' });
      if (res.ok) {
        setCandidates([]);
        visionDetector.resetTracks();
      }
    } catch (e: any) {
      console.warn('Failed to clear candidates:', e?.message || String(e));
    }
  };

  // Real-time activity callback from CV processing
  const handleNewActivity = useCallback((act: ActivityRecord) => {
    setActivities((prev) => [act, ...prev.slice(0, 199)]);
  }, []);

  // Real-time candidates list callback from CV processing (Fix 4: merge monotonically)
  const handleUpdateCandidatesFromCV = useCallback((updatedCandidates: Candidate[]) => {
    setCandidates((prev) => {
      const map = new Map<string, Candidate>(prev.map((c) => [c.id, c]));
      for (const incoming of updatedCandidates) {
        const existing = map.get(incoming.id);
        if (!existing) {
          map.set(incoming.id, incoming);
        } else {
          const mergedScore = Math.max(existing.currentScore, incoming.currentScore);
          const warningLevel =
            mergedScore > 70 ? 'high' : mergedScore > 35 ? 'warning' : 'normal';
          map.set(incoming.id, {
            ...existing,
            ...incoming,
            currentScore: incoming.warningCleared ? 0 : mergedScore,
            warningLevel: incoming.warningCleared ? 'normal' : warningLevel,
          });
        }
      }
      return Array.from(map.values());
    });
  }, []);

  // Update app name in settings
  const handleUpdateAppName = async (name: string) => {
    setAppName(name);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName: name }),
      });
    } catch (e) {
      console.error('Failed to persist app name:', e);
    }
  };

  const handleSelectCameraById = (id: string) => {
    const found = cameras.find((c) => c.id === id);
    if (found) {
      setSelectedCamera(found);
    }
  };

  const handleRefreshAll = () => {
    fetchCameras();
    fetchCandidates();
    fetchActivities();
    fetchDiagnostics();
  };

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation Bar */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={handleSetTab}
        diagnostics={diagnostics}
        cameras={cameras}
        selectedCameraId={selectedCamera?.id || ''}
        onSelectCamera={handleSelectCameraById}
        onRefresh={handleRefreshAll}
        appName={appName}
        candidateCount={candidates.length}
        onOpenExport={() => setIsExportModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full min-w-0 pb-12">
        {currentTab === 'player' && (
          <MainPlayer
            selectedCamera={selectedCamera}
            cameras={cameras}
            onSelectCamera={setSelectedCamera}
            onNewActivity={handleNewActivity}
            onUpdateCandidates={handleUpdateCandidatesFromCV}
            diagnostics={diagnostics}
            onUpdateDiagnostics={setDiagnostics}
          />
        )}

        {currentTab === 'activities' && (
          <ActivityPanel
            activities={activities}
            cameras={cameras}
            activityTypes={activityTypes}
            onRefresh={() => {
              fetchActivities();
              fetchCandidates(true);
            }}
            onClearActivities={handleClearActivities}
            onDeleteActivity={handleDeleteActivity}
            onOpenExport={() => setIsExportModalOpen(true)}
          />
        )}

        {currentTab === 'candidates' && (
          <CandidateList
            candidates={candidates}
            onRefresh={() => {
              fetchCandidates(true);
              fetchActivities();
            }}
            onClearWarning={handleClearWarning}
            onUpdateCandidate={handleUpdateCandidate}
            onClearActivities={handleClearActivities}
            onClearCandidates={handleClearCandidates}
            onDeleteCandidate={handleDeleteCandidate}
            onOpenExport={() => setIsExportModalOpen(true)}
          />
        )}

        {currentTab === 'admin' && (
          <AdminPanel
            cameras={cameras}
            onRefreshCameras={fetchCameras}
            activityTypes={activityTypes}
            onRefreshActivityTypes={fetchActivityTypes}
            scoreThresholds={scoreThresholds}
            onRefreshThresholds={fetchThresholds}
            candidates={candidates}
            onRefreshCandidates={fetchCandidates}
            diagnostics={diagnostics}
            onRefreshDiagnostics={fetchDiagnostics}
            appName={appName}
            onUpdateAppName={handleUpdateAppName}
            onExitAdmin={() => handleSetTab('player')}
          />
        )}
      </main>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        candidates={candidates}
        activities={activities}
        cameras={cameras}
        appName={appName}
      />

      {/* Footer with core compliance notice */}
      <footer className="border-t py-4 px-4 sm:px-6 text-center text-xs transition-colors bg-white/80 border-neutral-200 text-neutral-500 dark:bg-neutral-950/80 dark:border-neutral-900 dark:text-neutral-400">
        <p className="max-w-3xl mx-auto">
          <strong>Teacher Supervisory Assistant:</strong> This system assists invigilation by observing video feeds and calculating activity indicators. The system does not make automated disciplinary determinations; invigilators and supervisors retain sole authority.
        </p>
      </footer>
    </div>
  );
}
