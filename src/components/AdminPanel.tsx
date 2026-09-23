/**
 * src/components/AdminPanel.tsx - Protected Administrator Control Dashboard
 * Password-authenticated portal using environment credentials (ADMIN_USERNAME & ADMIN_PASSWORD)
 * providing camera CRUD, stream connection testing, video file uploading, activity weight rules configuration,
 * and score threshold tuning. Fully responsive and styled for Light, Dark, and System themes.
 */
import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  Camera,
  Activity,
  Sliders,
  Users,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  Save,
  Key,
  Upload,
  Play,
  Cloud,
  Link2,
} from 'lucide-react';
import {
  CameraSource,
  ActivityTypeConfig,
  ScoreThresholds,
  Candidate,
  SystemDiagnostics,
} from '../types.js';
import { parseCloudVideoLink, resolveSourceUrl } from '../utils/sourceResolver.js';

interface AdminPanelProps {
  cameras: CameraSource[];
  onRefreshCameras: () => void;
  activityTypes: ActivityTypeConfig[];
  onRefreshActivityTypes: () => void;
  scoreThresholds: ScoreThresholds;
  onRefreshThresholds: () => void;
  candidates: Candidate[];
  onRefreshCandidates: () => void;
  diagnostics: SystemDiagnostics | null;
  onRefreshDiagnostics: () => void;
  appName: string;
  onUpdateAppName: (name: string) => void;
  onExitAdmin?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  cameras,
  onRefreshCameras,
  activityTypes,
  onRefreshActivityTypes,
  scoreThresholds,
  onRefreshThresholds,
  candidates,
  onRefreshCandidates,
  diagnostics,
  onRefreshDiagnostics,
  onExitAdmin,
}) => {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [adminUsername, setAdminUsername] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Active Admin Sub-tab
  const [activeTab, setActiveTab] = useState<'cameras' | 'activities' | 'scores' | 'candidates' | 'system'>('cameras');

  // New Camera Form state
  const [showAddCamera, setShowAddCamera] = useState<boolean>(false);
  const [newCamName, setNewCamName] = useState<string>('');
  const [newCamType, setNewCamType] = useState<CameraSource['sourceType']>('stream_url');
  const [newCamUrl, setNewCamUrl] = useState<string>('');
  const [newCamUsername, setNewCamUsername] = useState<string>('');
  const [newCamPassword, setNewCamPassword] = useState<string>('');
  const [newCamLocation, setNewCamLocation] = useState<string>('');

  // Testing & Upload state
  const [isTestingSource, setIsTestingSource] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; resolvedUrl?: string } | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const [rowTestingId, setRowTestingId] = useState<string | null>(null);

  // New Activity Type Form state
  const [showAddActivity, setShowAddActivity] = useState<boolean>(false);
  const [newActName, setNewActName] = useState<string>('');
  const [newActDesc, setNewActDesc] = useState<string>('');
  const [newActWeight, setNewActWeight] = useState<number>(10);

  // Editable Score Thresholds
  const [normalMax, setNormalMax] = useState<number>(scoreThresholds.normalMax);
  const [warningMax, setWarningMax] = useState<number>(scoreThresholds.warningMax);
  const [highMin, setHighMin] = useState<number>(scoreThresholds.highMin);

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setNormalMax(scoreThresholds.normalMax);
    setWarningMax(scoreThresholds.warningMax);
    setHighMin(scoreThresholds.highMin);
  }, [scoreThresholds]);

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminUsername,
          password: adminPassword,
        }),
      });

      const data = await res.json();
      if (res.ok && data.token) {
        setIsAuthenticated(true);
        setAuthToken(data.token);
        setAuthError(null);
      } else {
        setAuthError(data.error || 'Invalid credentials');
      }
    } catch {
      setAuthError('Connection to authentication server failed');
    }
  };

  const handleTestSourceConnection = async () => {
    if (!newCamUrl.trim() && newCamType !== 'webcam') {
      showStatus('Please enter a source URL or file path to test', 'error');
      return;
    }

    setIsTestingSource(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/cameras/test-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sourceType: newCamType,
          sourceUrl: newCamType === 'webcam' ? 'webcam' : newCamUrl.trim(),
          username: newCamUsername.trim() || undefined,
          password: newCamPassword.trim() || undefined,
        }),
      });

      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message,
        resolvedUrl: data.resolvedUrl,
      });
    } catch (e: any) {
      setTestResult({
        success: false,
        message: `Network error while executing stream test pipeline: ${e.message}`,
      });
    } finally {
      setIsTestingSource(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    const formData = new FormData();
    formData.append('videoFile', file);

    try {
      const res = await fetch('/api/cameras/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.filePath) {
        setNewCamUrl(data.filePath);
        showStatus(`Video file uploaded successfully (${(data.sizeBytes / (1024 * 1024)).toFixed(1)} MB)`);
      } else {
        showStatus(data.error || 'Failed to upload video file', 'error');
      }
    } catch (e: any) {
      showStatus('File upload failed: ' + e.message, 'error');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleRowTest = async (cam: CameraSource) => {
    setRowTestingId(cam.id);
    try {
      const res = await fetch('/api/cameras/test-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sourceType: cam.sourceType,
          sourceUrl: cam.sourceUrl,
          username: cam.username,
          password: cam.password,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showStatus(`Camera "${cam.name}" Connected: ${data.message}`, 'success');
      } else {
        showStatus(`Camera "${cam.name}" Test Failed: ${data.message}`, 'error');
      }
    } catch (err: any) {
      showStatus(`Error testing "${cam.name}": ${err.message}`, 'error');
    } finally {
      setRowTestingId(null);
    }
  };

  const handleAddCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCamName.trim() || (!newCamUrl.trim() && newCamType !== 'webcam')) return;

    const rawUrl = newCamType === 'webcam' ? 'webcam' : newCamUrl.trim();
    const resolvedUrl = resolveSourceUrl(rawUrl, newCamUsername.trim() || undefined, newCamPassword.trim() || undefined);

    try {
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: newCamName.trim(),
          sourceType: newCamType,
          sourceUrl: rawUrl,
          resolvedUrl: resolvedUrl,
          username: newCamUsername.trim() || undefined,
          password: newCamPassword.trim() || undefined,
          location: newCamLocation.trim() || 'Exam Hall',
        }),
      });

      if (res.ok) {
        showStatus('Camera added successfully');
        setShowAddCamera(false);
        setNewCamName('');
        setNewCamUrl('');
        setNewCamUsername('');
        setNewCamPassword('');
        setNewCamLocation('');
        setTestResult(null);
        onRefreshCameras();
      } else {
        showStatus('Failed to add camera', 'error');
      }
    } catch {
      showStatus('Network error while adding camera', 'error');
    }
  };

  const handleDeleteCamera = async (id: string) => {
    if (!confirm('Are you sure you want to remove this camera feed?')) return;

    try {
      const res = await fetch(`/api/cameras/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        showStatus('Camera removed');
        onRefreshCameras();
      } else {
        showStatus('Failed to delete camera', 'error');
      }
    } catch {
      showStatus('Error deleting camera', 'error');
    }
  };

  const handleAddActivityType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActName.trim()) return;

    try {
      const res = await fetch('/api/activity-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: newActName.trim(),
          description: newActDesc.trim(),
          scoreWeight: Number(newActWeight),
        }),
      });

      if (res.ok) {
        showStatus('Activity type registered');
        setShowAddActivity(false);
        setNewActName('');
        setNewActDesc('');
        onRefreshActivityTypes();
      } else {
        showStatus('Failed to create activity type', 'error');
      }
    } catch {
      showStatus('Network error', 'error');
    }
  };

  const handleUpdateWeight = async (id: string, newWeight: number) => {
    try {
      const res = await fetch(`/api/activity-types/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ scoreWeight: Number(newWeight) }),
      });

      if (res.ok) {
        showStatus('Weight updated');
        onRefreshActivityTypes();
      }
    } catch {
      showStatus('Failed to update weight', 'error');
    }
  };

  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings/thresholds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          normalMax: Number(normalMax),
          warningMax: Number(warningMax),
          highMin: Number(highMin),
        }),
      });

      if (res.ok) {
        showStatus('Score warning thresholds updated successfully');
        onRefreshThresholds();
      } else {
        showStatus('Failed to save thresholds', 'error');
      }
    } catch {
      showStatus('Network error saving thresholds', 'error');
    }
  };

  const handleResetSession = async () => {
    if (
      !confirm(
        'WARNING: This will clear all current session candidates and tracking data to start a new exam. Are you sure?'
      )
    ) {
      return;
    }

    try {
      const res = await fetch('/api/candidates/reset-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        showStatus('Session reset successfully. Fresh exam session started.');
        onRefreshCandidates();
      } else {
        showStatus('Failed to reset session', 'error');
      }
    } catch {
      showStatus('Error resetting session', 'error');
    }
  };

  // If not logged in, render authentication gate
  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-16 space-y-6 min-w-0">
        <div className="rounded-2xl p-6 shadow-2xl space-y-5 border transition-colors bg-white border-neutral-200 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto shadow-inner border bg-neutral-100 border-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300">
            <Lock className="w-6 h-6" />
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">Administrator Access</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Enter authorized administrator credentials to manage cameras, scoring, and thresholds.
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-lg border text-xs flex items-center gap-2 bg-red-50 border-red-200 text-red-800 dark:bg-red-950/80 dark:border-red-800/80 dark:text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Admin ID:</label>
              <input
                type="text"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                placeholder="admin"
                className="w-full rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Admin Password:</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                required
              />
            </div>

            <div className="p-2.5 rounded-lg border text-[11px] bg-neutral-50 border-neutral-200 text-neutral-600 dark:bg-neutral-950/60 dark:border-neutral-800/80 dark:text-neutral-400">
              Administrator credentials are configured in environment variables (<code className="font-mono text-amber-600 dark:text-amber-400">ADMIN_USERNAME</code> and <code className="font-mono text-amber-600 dark:text-amber-400">ADMIN_PASSWORD</code>).
            </div>

            <button
              type="submit"
              className="cursor-pointer w-full py-2.5 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
            >
              Authenticate & Unlock Admin Panel
            </button>

            {onExitAdmin && (
              <div className="pt-2 text-center border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={onExitAdmin}
                  className="cursor-pointer text-xs font-medium transition-colors text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white"
                >
                  ← Return to Live Monitor
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6 min-w-0">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="w-5 h-5 text-emerald-500" />
            <span>Administrator Control Center</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Configure CCTV camera sources, scoring weights, warning thresholds, and CV inference.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onExitAdmin && (
            <button
              type="button"
              onClick={onExitAdmin}
              className="cursor-pointer px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 bg-neutral-100 border-neutral-300 text-neutral-700 hover:text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-700"
            >
              Exit to Monitor
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsAuthenticated(false)}
            className="cursor-pointer px-3 py-1.5 rounded-lg border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 bg-white border-neutral-300 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-white"
          >
            Lock Session
          </button>
        </div>
      </div>

      {/* Status toast message */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/70 dark:border-emerald-800/80 dark:text-emerald-200'
              : 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/70 dark:border-red-800/80 dark:text-red-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl border text-xs overflow-x-auto min-w-0 bg-neutral-100 border-neutral-200 dark:bg-neutral-900/80 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setActiveTab('cameras')}
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
            activeTab === 'cameras'
              ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Cameras ({cameras.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('activities')}
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
            activeTab === 'activities'
              ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Activity Types & Weights</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scores')}
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
            activeTab === 'scores'
              ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Warning Thresholds</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('candidates')}
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
            activeTab === 'candidates'
              ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Candidates</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('system')}
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
            activeTab === 'system'
              ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>System & CV</span>
        </button>
      </div>

      {/* TAB 1: CAMERAS */}
      {activeTab === 'cameras' && (
        <div className="space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">CCTV & Network Cameras</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Manage all RTSP streams, IP cameras, and MP4 video recordings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddCamera(!showAddCamera)}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors self-start sm:self-auto bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Camera Feed</span>
            </button>
          </div>

          {/* Add Camera Form */}
          {showAddCamera && (
            <form
              onSubmit={handleAddCamera}
              className="p-4 sm:p-5 rounded-xl border space-y-4 text-xs shadow-xl transition-colors bg-white border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800"
            >
              <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-500" />
                  <h4 className="font-semibold text-sm text-neutral-900 dark:text-white">Configure Universal Camera Feed</h4>
                </div>
                <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 hidden sm:inline">
                  Universal Pipeline: ffmpeg &rarr; extractFrames()
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Camera Name:</label>
                  <input
                    type="text"
                    value={newCamName}
                    onChange={(e) => setNewCamName(e.target.value)}
                    placeholder="e.g. Exam Hall 101 Front"
                    className="w-full rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Source Type:</label>
                  <select
                    value={newCamType}
                    onChange={(e) => {
                      const val = e.target.value as CameraSource['sourceType'];
                      setNewCamType(val);
                      if (val === 'webcam') {
                        setNewCamUrl('webcam');
                      } else if (newCamUrl === 'webcam') {
                        setNewCamUrl('');
                      }
                      setTestResult(null);
                    }}
                    className="cursor-pointer w-full rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                  >
                    <option value="rtsp">RTSP Camera Stream (rtsp://...)</option>
                    <option value="ip_camera">IP Camera (MJPEG / Network Stream)</option>
                    <option value="stream_url">Live Stream URL (.m3u8 / HLS / HTTP)</option>
                    <option value="cloud_link">Cloud Video Share Link (Google Drive, S3, Dropbox)</option>
                    <option value="file_upload">Uploaded Video File (Local Storage)</option>
                    <option value="webcam">Local USB / Invigilator Webcam</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Location Label:</label>
                  <input
                    type="text"
                    value={newCamLocation}
                    onChange={(e) => setNewCamLocation(e.target.value)}
                    placeholder="e.g. Science Wing Floor 2"
                    className="w-full rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Source URL or File Upload section */}
              {newCamType !== 'webcam' && (
                <div className="space-y-3 pt-1 border-t border-neutral-200 dark:border-neutral-800/60">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-neutral-600 dark:text-neutral-400 mb-1">
                        {newCamType === 'cloud_link'
                          ? 'Cloud Share Link / Direct Video URL:'
                          : newCamType === 'rtsp'
                          ? 'RTSP Stream URL (e.g. rtsp://192.168.1.100:554/stream1):'
                          : newCamType === 'file_upload'
                          ? 'Uploaded File Path:'
                          : 'Source Stream URL / File Path:'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCamUrl}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewCamUrl(val);
                            setTestResult(null);
                            const parsed = parseCloudVideoLink(val);
                            if (parsed.isCloud && newCamType !== 'cloud_link') {
                              setNewCamType('cloud_link');
                            }
                          }}
                          placeholder={
                            newCamType === 'cloud_link'
                              ? 'https://drive.google.com/file/d/123xyz... or https://cdn.com/video.mp4'
                              : newCamType === 'rtsp'
                              ? 'rtsp://192.168.1.50/live/ch0'
                              : newCamType === 'file_upload'
                              ? '/uploads/file-123.mp4'
                              : 'https://stream.example.com/live.m3u8'
                          }
                          className="w-full rounded-lg px-2.5 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                          required
                        />

                        {newCamType === 'file_upload' && (
                          <label className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border cursor-pointer font-medium text-xs transition-colors bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-white dark:hover:bg-neutral-700">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{isUploadingFile ? 'Uploading...' : 'Choose File'}</span>
                            <input
                              type="file"
                              accept="video/*"
                              onChange={handleFileUpload}
                              disabled={isUploadingFile}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* Cloud Link Real-time Detection & Resolution Feedback */}
                      {newCamUrl.trim() && (() => {
                        const cloudInfo = parseCloudVideoLink(newCamUrl.trim());
                        if (cloudInfo.isCloud) {
                          return (
                            <div className="mt-2 p-2.5 rounded-lg border text-xs space-y-1 bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800/80 dark:text-emerald-200 animate-in fade-in">
                              <div className="flex items-center gap-1.5 font-semibold">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>{cloudInfo.providerName} Cloud Video Detected</span>
                              </div>
                              <p className="text-[11px] font-mono break-all opacity-90 pl-5">
                                Generated Playable Stream: {cloudInfo.playableUrl}
                              </p>
                              <p className="text-[10.5px] opacity-75 pl-5">
                                Web preview link converted into range-compatible streaming stream with virus warning bypass and CORS enabled.
                              </p>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Quick Presets */}
                      <div className="flex items-center justify-between text-[11px] pt-1.5">
                        <span className="text-neutral-500 dark:text-neutral-400">Quick Test Cloud Stream:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setNewCamUrl('https://drive.google.com/file/d/1_rU3wGEHvWmfnSDHmKnLnbN9HfQHOkeA/view');
                            setNewCamType('cloud_link');
                            if (!newCamName) setNewCamName('Exam Hall - Cloud Feed (Google Drive)');
                            setTestResult(null);
                          }}
                          className="cursor-pointer font-mono text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline"
                        >
                          + Insert Google Drive Sample Link
                        </button>
                      </div>
                    </div>

                    {/* Credentials for RTSP or IP cameras */}
                    {(newCamType === 'rtsp' || newCamType === 'ip_camera') && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-neutral-600 dark:text-neutral-400 mb-1 flex items-center gap-1">
                            <Key className="w-3 h-3 text-neutral-400" />
                            <span>Username:</span>
                          </label>
                          <input
                            type="text"
                            value={newCamUsername}
                            onChange={(e) => setNewCamUsername(e.target.value)}
                            placeholder="admin"
                            className="w-full rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Password:</label>
                          <input
                            type="password"
                            value={newCamPassword}
                            onChange={(e) => setNewCamPassword(e.target.value)}
                            placeholder="••••••"
                            className="w-full rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Test Pipeline Results Banner */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs space-y-1 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/70 dark:border-emerald-800/80 dark:text-emerald-200'
                      : 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/70 dark:border-red-800/80 dark:text-red-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {testResult.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                  {testResult.resolvedUrl && testResult.resolvedUrl !== newCamUrl && (
                    <p className="text-[11px] font-mono opacity-80 pl-6">
                      Resolved Stream URL: {testResult.resolvedUrl}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800/80">
                <button
                  type="button"
                  onClick={handleTestSourceConnection}
                  disabled={isTestingSource || (!newCamUrl.trim() && newCamType !== 'webcam')}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-50 transition-colors bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-white dark:hover:bg-neutral-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingSource ? 'animate-spin' : ''}`} />
                  <span>{isTestingSource ? 'Testing Stream...' : 'Test Connection'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCamera(false);
                      setTestResult(null);
                    }}
                    className="cursor-pointer px-3 py-1.5 rounded-lg transition-colors text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="cursor-pointer px-4 py-1.5 rounded-lg bg-emerald-500 text-neutral-950 font-semibold hover:bg-emerald-400 transition-colors"
                  >
                    Save Camera
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Cameras Table */}
          <div className="rounded-xl overflow-hidden border text-xs shadow-sm transition-colors bg-white/90 border-neutral-200 dark:bg-neutral-900/60 dark:border-neutral-800 min-w-0">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left min-w-[640px]">
                <thead className="border-b font-medium bg-neutral-50 border-neutral-200 text-neutral-600 dark:bg-neutral-950/80 dark:border-neutral-800 dark:text-neutral-400">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Source Type</th>
                    <th className="py-3 px-4">Configured URL / Path</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Auth</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/60 text-neutral-700 dark:text-neutral-300">
                  {cameras.map((cam) => (
                    <tr key={cam.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                      <td className="py-3 px-4 font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                        <Camera className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span>{cam.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const cloud = parseCloudVideoLink(cam.sourceUrl);
                          if (cloud.isCloud) {
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase bg-emerald-50 border border-emerald-300 text-emerald-800 dark:bg-emerald-950/70 dark:border-emerald-700/80 dark:text-emerald-300">
                                <Cloud className="w-3 h-3 text-emerald-500" />
                                <span>{cloud.providerName}</span>
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase bg-neutral-100 border border-neutral-300 text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300">
                              {cam.sourceType}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 font-mono text-neutral-500 dark:text-neutral-400 max-w-xs">
                        <div className="truncate" title={cam.sourceUrl}>
                          {cam.sourceUrl}
                        </div>
                        {cam.resolvedUrl && cam.resolvedUrl !== cam.sourceUrl && (
                          <div
                            className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate flex items-center gap-1 mt-0.5"
                            title={`Stream: ${cam.resolvedUrl}`}
                          >
                            <Link2 className="w-2.5 h-2.5 shrink-0" />
                            <span>{cam.resolvedUrl}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-neutral-500 dark:text-neutral-400">{cam.location}</td>
                      <td className="py-3 px-4 text-neutral-500">
                        {cam.username ? (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px]">
                            <Key className="w-3 h-3" />
                            <span>Auth</span>
                          </span>
                        ) : (
                          <span>Public</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleRowTest(cam)}
                          disabled={rowTestingId === cam.id}
                          className="cursor-pointer px-2 py-1 text-[11px] font-medium rounded border flex items-center gap-1 transition-colors disabled:opacity-50 bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200 dark:border-neutral-700"
                          title="Test stream frame extraction via ffmpeg"
                        >
                          <Play className={`w-3 h-3 ${rowTestingId === cam.id ? 'animate-spin' : ''}`} />
                          <span>{rowTestingId === cam.id ? 'Testing...' : 'Test Feed'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCamera(cam.id)}
                          className="cursor-pointer p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40 rounded transition-colors"
                          title="Delete camera"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVITY TYPES & WEIGHTS */}
      {activeTab === 'activities' && (
        <div className="space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Activity Types & Score Weights</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Configure the score points incremented when specific observable activities occur.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddActivity(!showAddActivity)}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors self-start sm:self-auto bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Activity Type</span>
            </button>
          </div>

          {showAddActivity && (
            <form
              onSubmit={handleAddActivityType}
              className="p-4 rounded-xl border space-y-3 text-xs transition-colors bg-white border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 shadow-md"
            >
              <h4 className="font-semibold text-neutral-900 dark:text-white">Create Observable Activity Type</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Activity Name:</label>
                  <input
                    type="text"
                    value={newActName}
                    onChange={(e) => setNewActName(e.target.value)}
                    placeholder="e.g. Excessive desk fidgeting"
                    className="w-full rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Description:</label>
                  <input
                    type="text"
                    value={newActDesc}
                    onChange={(e) => setNewActDesc(e.target.value)}
                    placeholder="Description of observable temporal motion"
                    className="w-full rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Score Weight (+points):</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={newActWeight}
                    onChange={(e) => setNewActWeight(Number(e.target.value))}
                    className="w-full rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white font-mono"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddActivity(false)}
                  className="cursor-pointer px-3 py-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cursor-pointer px-4 py-1.5 rounded-lg font-semibold bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
                >
                  Save Activity Type
                </button>
              </div>
            </form>
          )}

          <div className="rounded-xl overflow-hidden border text-xs shadow-sm transition-colors bg-white/90 border-neutral-200 dark:bg-neutral-900/60 dark:border-neutral-800 min-w-0">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left min-w-[550px]">
                <thead className="border-b font-medium bg-neutral-50 border-neutral-200 text-neutral-600 dark:bg-neutral-950/80 dark:border-neutral-800 dark:text-neutral-400">
                  <tr>
                    <th className="py-3 px-4">Observable Activity</th>
                    <th className="py-3 px-4">Observation Criteria</th>
                    <th className="py-3 px-4">Score Weight (+pts)</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/60 text-neutral-700 dark:text-neutral-300">
                  {activityTypes.map((type) => (
                    <tr key={type.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                      <td className="py-3 px-4 font-semibold text-neutral-900 dark:text-white">{type.name}</td>
                      <td className="py-3 px-4 text-neutral-500 dark:text-neutral-400">{type.description}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            defaultValue={type.scoreWeight}
                            onBlur={(e) => handleUpdateWeight(type.id, Number(e.target.value))}
                            className="w-16 px-2 py-1 rounded text-center font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-neutral-50 border border-neutral-300 dark:bg-neutral-950 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                          />
                          <span className="text-neutral-500 text-[11px]">pts</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WARNING THRESHOLDS */}
      {activeTab === 'scores' && (
        <form
          onSubmit={handleSaveThresholds}
          className="rounded-xl p-5 space-y-5 text-xs max-w-2xl border shadow-sm transition-colors bg-white border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 min-w-0"
        >
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Score Warning Thresholds</h3>
            <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">
              Define the 3 warning levels based on cumulative activity scores (capped at 100).
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-3.5 rounded-xl border space-y-1 bg-neutral-50 border-neutral-200 dark:bg-neutral-950 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">1. Normal Level</span>
                <span className="text-neutral-500 font-mono">0 to {normalMax} pts</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Tracking nameplate appears in normal neutral style.
              </p>
              <div className="pt-2">
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Max Normal Score:</label>
                <input
                  type="number"
                  min={10}
                  max={60}
                  value={normalMax}
                  onChange={(e) => setNormalMax(Number(e.target.value))}
                  className="w-32 rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-white border border-neutral-300 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-700 dark:text-white"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl border space-y-1 bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-900 dark:text-amber-300">2. Warning Level (Amber)</span>
                <span className="font-mono text-amber-800 dark:text-amber-400">
                  {normalMax + 1} to {warningMax} pts
                </span>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-500/80">
                Tracking nameplate switches to subtle warning amber badge for teacher awareness.
              </p>
              <div className="pt-2">
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Max Warning Score:</label>
                <input
                  type="number"
                  min={normalMax + 1}
                  max={90}
                  value={warningMax}
                  onChange={(e) => setWarningMax(Number(e.target.value))}
                  className="w-32 rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-white border border-neutral-300 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-700 dark:text-white"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl border space-y-1 bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-800/40">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-red-900 dark:text-red-300">3. High Warning Level (Red)</span>
                <span className="font-mono text-red-800 dark:text-red-400">
                  {highMin} to 100 pts
                </span>
              </div>
              <p className="text-[11px] text-red-700 dark:text-red-400/80">
                Tracking nameplate changes to prominent RED appearance.
              </p>
              <div className="pt-2">
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1">High Warning Min Score:</label>
                <input
                  type="number"
                  min={warningMax + 1}
                  max={99}
                  value={highMin}
                  onChange={(e) => setHighMin(Number(e.target.value))}
                  className="w-32 rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-white border border-neutral-300 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Update Thresholds</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: CANDIDATES MANAGEMENT */}
      {activeTab === 'candidates' && (
        <div className="space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Candidates & Session Reset</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Manage all registered candidates or clear session for a brand new examination.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetSession}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors self-start sm:self-auto bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Exam Session</span>
            </button>
          </div>

          <div className="rounded-xl p-4 text-xs space-y-3 border transition-colors bg-white border-neutral-200 text-neutral-700 dark:bg-neutral-900/60 dark:border-neutral-800 dark:text-neutral-300">
            <p>
              Total candidates currently tracked: <strong className="text-neutral-900 dark:text-white">{candidates.length}</strong>
            </p>
            <p className="text-neutral-500 dark:text-neutral-400">
              Resetting the session clears candidate scores and P-IDs from previous examinations while retaining system configuration and camera feeds.
            </p>
          </div>
        </div>
      )}

      {/* TAB 5: SYSTEM & CV ENGINE */}
      {activeTab === 'system' && (
        <div className="rounded-xl p-5 space-y-5 text-xs max-w-2xl border shadow-sm transition-colors bg-white border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 min-w-0">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">System Diagnostics & AI Configuration</h3>
            <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">
              Underlying Computer Vision worker and object tracker parameters.
            </p>
          </div>

          <div className="space-y-3 p-4 rounded-xl border font-mono text-[11px] bg-neutral-50 border-neutral-200 dark:bg-neutral-950 dark:border-neutral-800">
            <div className="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-900">
              <span className="text-neutral-500 dark:text-neutral-400">CV Worker Status:</span>
              <span
                className={
                  diagnostics?.cvWorkerStatus === 'online'
                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-amber-600 dark:text-amber-400'
                }
              >
                {diagnostics?.cvWorkerStatus.toUpperCase() || 'STANDBY'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-900">
              <span className="text-neutral-500 dark:text-neutral-400">Detector Model:</span>
              <span className="text-neutral-900 dark:text-white">{diagnostics?.modelName || 'YOLOv8n'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-900">
              <span className="text-neutral-500 dark:text-neutral-400">Tracker Algorithm:</span>
              <span className="text-neutral-900 dark:text-white">ByteTrack (Persisted P-IDs)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-900">
              <span className="text-neutral-500 dark:text-neutral-400">Processed Frames:</span>
              <span className="text-neutral-900 dark:text-white">{diagnostics?.processedFrames || 0}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-900">
              <span className="text-neutral-500 dark:text-neutral-400">Inference Rate:</span>
              <span className="text-neutral-900 dark:text-white">{(diagnostics?.fps || 0).toFixed(1)} FPS</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onRefreshDiagnostics}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Ping & Test CV Worker</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
