/**
 * Smart Classroom Exam Monitoring System
 * Realtime Monitoring Context & State Management
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { 
  AppSettings, 
  CameraConfig, 
  CameraTrack, 
  BehaviorEvent, 
  StudentRecord, 
  SystemStats, 
  RealtimeStateMessage,
  ExamSession,
  SeatRecord
} from '../types.js';

interface MonitoringContextType {
  // Live State
  settings: AppSettings | null;
  cameras: CameraConfig[];
  primaryCameraId: string;
  focusedCameraId: string;
  tracksByCamera: Record<string, CameraTrack[]>;
  students: StudentRecord[];
  events: BehaviorEvent[];
  stats: SystemStats;
  session: ExamSession | null;
  seats: SeatRecord[];
  isConnected: boolean;
  selectedStudent: StudentRecord | null;
  selectedTrack: CameraTrack | null;

  // Actions
  setFocusedCameraId: (id: string) => void;
  setSelectedStudent: (student: StudentRecord | null) => void;
  setSelectedTrack: (track: CameraTrack | null) => void;
  clearStudentWarning: (studentId: string) => Promise<boolean>;
  clearTrackWarning: (trackId: string) => Promise<boolean>;
  refreshData: () => Promise<void>;
  triggerDemoAction: (action: string, studentId?: string, durationSec?: number) => Promise<boolean>;
  toggleCamera: (cameraId: string) => Promise<void>;
  setPrimaryCamera: (cameraId: string) => Promise<void>;
  addCamera: (camera: Partial<CameraConfig>) => Promise<boolean>;
  deleteCamera: (cameraId: string) => Promise<boolean>;
  updateCameraConfig: (cameraId: string, updates: Partial<CameraConfig>) => Promise<boolean>;
  testCameraConnection: (cameraId: string) => Promise<any>;
  broadcastDetections: (cameraId: string, detections: CameraTrack[]) => void;
  clearActivityEvents: () => Promise<boolean>;
  associatePersonWithStudent: (personId: string, studentId: string | null) => Promise<boolean>;
}

const defaultStats: SystemStats = {
  total_cameras: 0,
  online_cameras: 0,
  detected_persons: 0,
  present_students: 0,
  students_moving: 0,
  warning_count: 0,
  high_suspicion_count: 0,
  active_alerts: 0,
  processing_fps: 0,
  system_health: 'optimal'
};

// Helper to merge events without duplicate keys, maintaining timestamp sort order
function mergeDeduplicatedEvents(existing: BehaviorEvent[], incoming: BehaviorEvent[]): BehaviorEvent[] {
  const map = new Map<string, BehaviorEvent>();
  // Process incoming first (most recent), then existing
  for (const item of incoming) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }
  for (const item of existing) {
    if (item && item.id && !map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
}

const MonitoringContext = createContext<MonitoringContextType | null>(null);

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [primaryCameraId, setPrimaryCameraId] = useState<string>('');
  const [focusedCameraId, setFocusedCameraId] = useState<string>('');
  const [tracksByCamera, setTracksByCamera] = useState<Record<string, CameraTrack[]>>({});
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [stats, setStats] = useState<SystemStats>(defaultStats);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [seats, setSeats] = useState<SeatRecord[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<CameraTrack | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initial HTTP Fetch
  const refreshData = useCallback(async () => {
    try {
      const [settingsRes, camerasRes, studentsRes, eventsRes, sessionRes, seatsRes] = await Promise.all([
        fetch('/api/settings').then(r => r.json()),
        fetch('/api/cameras').then(r => r.json()),
        fetch('/api/students').then(r => r.json()),
        fetch('/api/events?limit=40').then(r => r.json()),
        fetch('/api/session').then(r => r.json()),
        fetch('/api/seats').then(r => r.json())
      ]);

      setSettings(settingsRes);
      setCameras(camerasRes);
      setStudents(studentsRes);
      setEvents(prev => mergeDeduplicatedEvents(prev, eventsRes));
      setSession(sessionRes);
      setSeats(seatsRes);

      const primary = camerasRes.find((c: CameraConfig) => c.is_primary)?.camera_id || (camerasRes[0]?.camera_id || '');
      setPrimaryCameraId(primary);
      setFocusedCameraId(prev => (prev || primary));
    } catch (err) {
      console.warn('[MonitoringProvider] Initial fetch failed, waiting for telemetry sync:', err);
    }
  }, []);

  // WebSocket Connection with Graceful Fallback
  useEffect(() => {
    refreshData();

    function connectWs() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        console.warn('[WebSocket] Init failed, relying on HTTP polling:', err);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[WebSocket] Realtime monitoring gateway connected.');
      };

      ws.onmessage = (event) => {
        try {
          const msg: RealtimeStateMessage = JSON.parse(event.data);

          if (msg.type === 'INITIAL_SYNC') {
            if (msg.cameras) setCameras(msg.cameras);
            if (msg.students) setStudents(msg.students);
            if (msg.events) setEvents(prev => mergeDeduplicatedEvents(prev, msg.events || []));
            if (msg.stats) setStats(msg.stats);
          } else if ((msg as any).type === 'ACTIVITY_CLEARED') {
            setEvents([]);
          } else if (msg.type === 'TELEMETRY_UPDATE') {
            if (msg.tracks_by_camera) {
              setTracksByCamera(msg.tracks_by_camera);
            }
            if (msg.students) {
              setStudents(msg.students);
              // Update selected student if currently viewed
              if (selectedStudent) {
                const refreshed = msg.students.find(s => s.id === selectedStudent.id);
                if (refreshed) setSelectedStudent(refreshed);
              }
            }
            if (msg.stats) {
              setStats(msg.stats);
            }
            if (msg.new_event) {
              setEvents(prev => mergeDeduplicatedEvents(prev, [msg.new_event!]));
            }
          } else if (msg.type === 'EVENT' && msg.new_event) {
            setEvents(prev => mergeDeduplicatedEvents(prev, [msg.new_event!]));
            if (msg.cameras) setCameras(msg.cameras);
          }
        } catch (e) {
          console.warn('[WebSocket] Error parsing telemetry message:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        // Log as informational warning to prevent triggering false uncaught-exception alerts
        console.warn('[WebSocket] Connection interrupted. Live HTTP telemetry fallback active.');
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    }

    connectWs();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
  }, [refreshData]);

  // High-Resilience HTTP Polling Fallback (Activated when WebSocket is disconnected)
  useEffect(() => {
    let pollingTimer: NodeJS.Timeout | null = null;

    if (!isConnected) {
      const pollTelemetry = async () => {
        try {
          const res = await fetch('/api/telemetry');
          if (res.ok) {
            const data = await res.json();
            if (data.tracks_by_camera) setTracksByCamera(data.tracks_by_camera);
            if (data.students) {
              setStudents(data.students);
              if (selectedStudent) {
                const refreshed = data.students.find((s: StudentRecord) => s.id === selectedStudent.id);
                if (refreshed) setSelectedStudent(refreshed);
              }
            }
            if (data.stats) setStats(data.stats);
            if (data.cameras) setCameras(data.cameras);
          }
        } catch {
          // Ignore transient polling failure
        }
      };

      // Immediate tick and recurring poll
      pollTelemetry();
      pollingTimer = setInterval(pollTelemetry, 1000);
    }

    return () => {
      if (pollingTimer) clearInterval(pollingTimer);
    };
  }, [isConnected, selectedStudent]);

  // Demo Action trigger
  const triggerDemoAction = async (action: string, studentId?: string, durationSec = 10): Promise<boolean> => {
    try {
      const res = await fetch('/api/demo/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, student_id: studentId, duration_sec: durationSec })
      });
      const data = await res.json();
      return data.success;
    } catch (err) {
      console.error('Failed to trigger demo action:', err);
      return false;
    }
  };

  // Toggle Camera
  const toggleCamera = async (cameraId: string): Promise<void> => {
    const adminToken = localStorage.getItem('admin_token') || '';
    try {
      const res = await fetch(`/api/cameras/${cameraId}/toggle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        await refreshData();
      }
    } catch (err) {
      console.error('Failed to toggle camera:', err);
    }
  };

  // Set Primary Camera
  const setPrimaryCamera = async (cameraId: string): Promise<void> => {
    const adminToken = localStorage.getItem('admin_token') || '';
    try {
      const res = await fetch(`/api/cameras/${cameraId}/set-primary`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        setPrimaryCameraId(cameraId);
        setFocusedCameraId(cameraId);
        await refreshData();
      }
    } catch (err) {
      console.error('Failed to set primary camera:', err);
    }
  };

  // Add Camera
  const addCamera = async (camera: Partial<CameraConfig>): Promise<boolean> => {
    const adminToken = localStorage.getItem('admin_token') || '';
    try {
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(camera)
      });
      if (res.ok) {
        await refreshData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to add camera:', err);
      return false;
    }
  };

  // Delete Camera
  const deleteCamera = async (cameraId: string): Promise<boolean> => {
    const adminToken = localStorage.getItem('admin_token') || '';
    try {
      const res = await fetch(`/api/cameras/${cameraId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        if (focusedCameraId === cameraId) {
          setFocusedCameraId(primaryCameraId);
        }
        await refreshData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete camera:', err);
      return false;
    }
  };

  // Update Camera
  const updateCameraConfig = async (cameraId: string, updates: Partial<CameraConfig>): Promise<boolean> => {
    const adminToken = localStorage.getItem('admin_token') || '';
    try {
      const res = await fetch(`/api/cameras/${cameraId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        await refreshData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update camera:', err);
      return false;
    }
  };

  // Test Camera Connection
  const testCameraConnection = async (cameraId: string): Promise<any> => {
    try {
      const res = await fetch(`/api/cameras/${cameraId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection test failed.' };
    }
  };

  // Clear Student Warning / Reset Immediate Risk (Admin / Proctor Action)
  // Invariant: Unlatches warning and resets immediate risk, but preserves cumulative score
  const clearStudentWarning = useCallback(async (studentId: string): Promise<boolean> => {
    const adminToken = localStorage.getItem('admin_token') || '';
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, current_score: 0, status: 'present' } : s));
    if (selectedStudent?.id === studentId) {
      setSelectedStudent(prev => prev ? { ...prev, current_score: 0, status: 'present' } : null);
    }
    setTracksByCamera(prev => {
      const updated: Record<string, CameraTrack[]> = {};
      for (const [camId, trks] of Object.entries(prev)) {
        updated[camId] = trks.map(t => t.associated_student_id === studentId ? { 
          ...t, 
          current_score: 0, 
          warning_latched: false, 
          warning_cleared_at: Date.now() 
        } : t);
      }
      return updated;
    });
    try {
      await fetch(`/api/students/${studentId}/clear-warning`, { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
    } catch {
      // ignore
    }
    return true;
  }, [selectedStudent]);

  // Clear Track Warning / Reset Immediate Risk
  const clearTrackWarning = useCallback(async (trackId: string): Promise<boolean> => {
    const adminToken = localStorage.getItem('admin_token') || '';
    setTracksByCamera(prev => {
      const updated: Record<string, CameraTrack[]> = {};
      for (const [camId, trks] of Object.entries(prev)) {
        updated[camId] = trks.map(t => t.track_id === trackId ? { 
          ...t, 
          current_score: 0, 
          warning_latched: false, 
          warning_cleared_at: Date.now() 
        } : t);
      }
      return updated;
    });
    if (selectedTrack?.track_id === trackId) {
      setSelectedTrack(prev => prev ? { 
        ...prev, 
        current_score: 0, 
        warning_latched: false, 
        warning_cleared_at: Date.now() 
      } : null);
    }
    try {
      await fetch(`/api/tracks/${trackId}/clear-warning`, { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
    } catch {}
    return true;
  }, [selectedTrack]);

  // Broadcast Real-time Video Detections to Local State & Backend Server
  const broadcastDetections = useCallback((cameraId: string, detections: CameraTrack[]) => {
    // 1. Instantly update local camera tracks for zero-latency client HUD bounding boxes
    setTracksByCamera(prev => ({
      ...prev,
      [cameraId]: detections
    }));

    // 2. Transmit to server CV engine via WebSocket (or throttled POST)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'DETECTIONS',
          camera_id: cameraId,
          detections
        }));
      } catch {
        // ignore socket send errors
      }
    }
  }, []);

  // Clear Activity Events (Admin only - clears database events first)
  const clearActivityEvents = useCallback(async (): Promise<boolean> => {
    const adminToken = localStorage.getItem('admin_token') || '';
    try {
      const res = await fetch('/api/events/clear', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.success) {
        // Only clear frontend state after DB confirms successful deletion
        setEvents([]);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to clear activity events:', err);
      return false;
    }
  }, []);

  // Associate Person ID with Student (Admin only)
  const associatePersonWithStudent = useCallback(async (personId: string, studentId: string | null): Promise<boolean> => {
    const adminToken = localStorage.getItem('admin_token') || '';
    try {
      const res = await fetch(`/api/persons/${encodeURIComponent(personId)}/associate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ student_id: studentId })
      });
      if (res.ok) {
        await refreshData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to associate person with student:', err);
      return false;
    }
  }, [refreshData]);

  return (
    <MonitoringContext.Provider
      value={{
        settings,
        cameras,
        primaryCameraId,
        focusedCameraId,
        tracksByCamera,
        students,
        events,
        stats,
        session,
        seats,
        isConnected,
        selectedStudent,
        selectedTrack,
        setFocusedCameraId,
        setSelectedStudent,
        setSelectedTrack,
        clearStudentWarning,
        clearTrackWarning,
        refreshData,
        triggerDemoAction,
        toggleCamera,
        setPrimaryCamera,
        addCamera,
        deleteCamera,
        updateCameraConfig,
        testCameraConnection,
        broadcastDetections,
        clearActivityEvents,
        associatePersonWithStudent
      }}
    >
      {children}
    </MonitoringContext.Provider>
  );
}

export function useMonitoring() {
  const context = useContext(MonitoringContext);
  if (!context) {
    throw new Error('useMonitoring must be used within a MonitoringProvider');
  }
  return context;
}
