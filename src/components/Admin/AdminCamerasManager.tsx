/**
 * Smart Classroom Exam Monitoring System
 * Admin Camera Fleet & Source Architecture Manager
 * 
 * Recommended Architecture:
 * - Worker-per-camera isolation
 * - Support for RTSP, USB, HTTP, and Demo stream types
 * - Primary/Secondary role assignment
 * - Seat mapping association per camera view
 * - Separation of Video Stream & Detection Telemetry
 */

import React, { useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { CameraConfig, CameraSourceType } from '../../types.js';
import { 
  Video, 
  Star, 
  Power, 
  Settings2, 
  Plus, 
  Check, 
  AlertTriangle,
  Radio,
  Eye,
  Trash2,
  Activity,
  Layers,
  HelpCircle,
  X,
  RefreshCw,
  Clock,
  ShieldCheck
} from 'lucide-react';

export function AdminCamerasManager() {
  const { 
    cameras, 
    primaryCameraId, 
    setPrimaryCamera, 
    toggleCamera, 
    addCamera,
    deleteCamera,
    updateCameraConfig,
    testCameraConnection,
    seats,
    refreshData 
  } = useMonitoring();

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [testingCameraId, setTestingCameraId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    camera_id: string;
    success: boolean;
    latency_ms: number;
    fps: number;
    resolution: string;
    message: string;
  } | null>(null);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCameraId, setEditingCameraId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    camera_id: string;
    name: string;
    source_type: CameraSourceType;
    source_url: string;
    classroom_id: string;
    is_primary: boolean;
    enabled: boolean;
    width: number;
    height: number;
    target_fps: number;
    view_angle_description: string;
    monitored_seats: string[];
  }>({
    camera_id: '',
    name: '',
    source_type: 'rtsp',
    source_url: '',
    classroom_id: '',
    is_primary: false,
    enabled: true,
    width: 1920,
    height: 1080,
    target_fps: 15,
    view_angle_description: '',
    monitored_seats: []
  });

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleMakePrimary = async (cameraId: string) => {
    await setPrimaryCamera(cameraId);
    showFeedback('success', `Camera ${cameraId.toUpperCase()} is now the Primary Viewing Camera.`);
  };

  const handleToggle = async (cameraId: string) => {
    await toggleCamera(cameraId);
    showFeedback('info', `Camera ${cameraId.toUpperCase()} state toggled.`);
  };

  const handleTestConnection = async (cameraId: string) => {
    setTestingCameraId(cameraId);
    setTestResult(null);
    try {
      const res = await testCameraConnection(cameraId);
      setTestResult(res);
      if (res.success) {
        showFeedback('success', `RTSP handshake verified (${res.latency_ms}ms latency).`);
      } else {
        showFeedback('error', res.message || 'Stream connection test failed.');
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Test failed.');
    } finally {
      setTestingCameraId(null);
    }
  };

  const handleDelete = async (camera: CameraConfig) => {
    if (camera.is_primary) {
      showFeedback('error', 'Cannot delete the Primary Camera. Assign another camera as primary first.');
      return;
    }
    if (window.confirm(`Are you sure you want to remove "${camera.name}" (${camera.camera_id}) from MongoDB?`)) {
      const ok = await deleteCamera(camera.camera_id);
      if (ok) {
        showFeedback('success', `Camera ${camera.camera_id.toUpperCase()} removed from fleet.`);
      } else {
        showFeedback('error', 'Failed to remove camera.');
      }
    }
  };

  const openAddModal = () => {
    const nextNum = cameras.length + 1;
    const cid = `cam-${nextNum}`;
    setEditingCameraId(null);
    setFormData({
      camera_id: cid,
      name: `Camera ${nextNum}`,
      source_type: 'rtsp',
      source_url: '',
      classroom_id: '',
      is_primary: cameras.length === 0,
      enabled: true,
      width: 1920,
      height: 1080,
      target_fps: 15,
      view_angle_description: '',
      monitored_seats: seats.map(s => s.id)
    });
    setIsModalOpen(true);
  };

  const openEditModal = (camera: CameraConfig) => {
    setEditingCameraId(camera.camera_id);
    setFormData({
      camera_id: camera.camera_id,
      name: camera.name,
      source_type: camera.source_type,
      source_url: camera.source_url,
      classroom_id: camera.classroom_id,
      is_primary: camera.is_primary,
      enabled: camera.enabled !== false,
      width: camera.resolution.width,
      height: camera.resolution.height,
      target_fps: camera.target_fps || 15,
      view_angle_description: camera.view_angle_description || '',
      monitored_seats: camera.monitored_seats || seats.map(s => s.id)
    });
    setIsModalOpen(true);
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCameraId) {
      // Update existing
      const ok = await updateCameraConfig(editingCameraId, {
        name: formData.name,
        source_type: formData.source_type,
        source_url: formData.source_url,
        classroom_id: formData.classroom_id,
        is_primary: formData.is_primary,
        enabled: formData.enabled,
        resolution: { width: Number(formData.width), height: Number(formData.height) },
        target_fps: Number(formData.target_fps),
        view_angle_description: formData.view_angle_description,
        monitored_seats: formData.monitored_seats
      });
      if (ok) {
        showFeedback('success', `Camera ${editingCameraId.toUpperCase()} updated.`);
        setIsModalOpen(false);
      } else {
        showFeedback('error', 'Failed to update camera.');
      }
    } else {
      // Add new
      const ok = await addCamera({
        camera_id: formData.camera_id,
        name: formData.name,
        source_type: formData.source_type,
        source_url: formData.source_url,
        classroom_id: formData.classroom_id,
        is_primary: formData.is_primary,
        enabled: formData.enabled,
        resolution: { width: Number(formData.width), height: Number(formData.height) },
        target_fps: Number(formData.target_fps),
        view_angle_description: formData.view_angle_description,
        monitored_seats: formData.monitored_seats
      });
      if (ok) {
        showFeedback('success', `New camera ${formData.name} added to fleet.`);
        setIsModalOpen(false);
      } else {
        showFeedback('error', 'Failed to register camera in MongoDB.');
      }
    }
  };

  const toggleSeatMonitoring = (seatId: string) => {
    setFormData(prev => {
      const exists = prev.monitored_seats.includes(seatId);
      return {
        ...prev,
        monitored_seats: exists
          ? prev.monitored_seats.filter(s => s !== seatId)
          : [...prev.monitored_seats, seatId]
      };
    });
  };

  return (
    <div className="space-y-6" id="admin-camera-fleet-section">
      
      {/* Header with Add Camera action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Video className="w-5 h-5 text-indigo-400" />
            <span>Camera Fleet &amp; Streaming Architecture</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Independent per-camera workers (RTSP, USB, HTTP) with seat mapping and separated video/telemetry channels.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-400">
            Primary Monitor: <strong className="text-white">{primaryCameraId.toUpperCase()}</strong>
          </div>
          <button
            onClick={openAddModal}
            id="btn-add-new-camera"
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shadow-sm shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Camera</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`p-3 rounded-lg text-xs flex items-center justify-between ${
          feedback.type === 'success' 
            ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' 
            : feedback.type === 'error'
            ? 'bg-rose-950/80 border border-rose-800 text-rose-300'
            : 'bg-cyan-950/80 border border-cyan-800 text-cyan-300'
        }`}>
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Live Test Results Card */}
      {testResult && (
        <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/40 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="font-bold text-white">
                Diagnostics Report: Camera {testResult.camera_id.toUpperCase()}
              </span>
            </div>
            <button onClick={() => setTestResult(null)} className="text-slate-500 hover:text-slate-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">STATUS</span>
              <span className={testResult.success ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {testResult.success ? 'STREAM ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">LATENCY</span>
              <span className="text-cyan-400 font-bold">{testResult.latency_ms} ms</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">FPS</span>
              <span className="text-slate-300">{testResult.fps} FPS</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">RESOLUTION</span>
              <span className="text-slate-300">{testResult.resolution}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 pt-1">{testResult.message}</p>
        </div>
      )}

      {/* Camera Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cameras.length === 0 && (
          <div className="col-span-full p-12 text-center text-slate-500 bg-slate-950 border border-slate-800 rounded-xl">
            <Video className="w-10 h-10 mx-auto mb-2 text-slate-600 stroke-1" />
            <h3 className="text-sm font-semibold text-slate-300">No Cameras in Fleet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              No hardware camera feeds registered. Click &quot;Add Camera&quot; to configure RTSP, USB, or IP surveillance streams.
            </p>
          </div>
        )}
        {cameras.map(camera => {
          const isPrimary = camera.camera_id === primaryCameraId;
          const isOnline = camera.status === 'online' && camera.enabled !== false;
          const monitored = camera.monitored_seats || [];

          return (
            <div 
              key={camera.camera_id}
              id={`camera-card-${camera.camera_id}`}
              className={`p-4 rounded-xl border transition-all ${
                isPrimary 
                  ? 'bg-slate-950 border-cyan-500/50 shadow-lg shadow-cyan-500/5 ring-1 ring-cyan-500/30' 
                  : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-sm text-white">{camera.name}</h3>
                    {isPrimary && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                        PRIMARY
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-800 text-indigo-300 uppercase border border-slate-700">
                      {camera.source_type}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono mt-0.5 block">
                    ID: {camera.camera_id} • Worker #{camera.camera_id.replace('cam-', '')}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    isOnline 
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' 
                      : 'bg-rose-950/80 text-rose-400 border border-rose-800'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                    {isOnline ? 'Online' : 'Offline'}
                  </span>

                  <button
                    onClick={() => handleToggle(camera.camera_id)}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      isOnline 
                        ? 'bg-slate-900 border-slate-700 text-slate-400 hover:text-rose-400' 
                        : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-emerald-400'
                    }`}
                    title={isOnline ? 'Disable Camera Worker' : 'Enable Camera Worker'}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Technical Stream Specifications */}
              <div className="grid grid-cols-2 gap-2 mt-4 p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-slate-500 text-[10px] block">SOURCE URL</span>
                  <span className="text-slate-300 truncate block text-[11px]" title={camera.source_url}>
                    {camera.source_url}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">RESOLUTION &amp; FPS</span>
                  <span className="text-slate-300">
                    {camera.resolution.width}x{camera.resolution.height} @ {camera.target_fps || camera.actual_fps || 15} FPS
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">OBSERVATION CLARITY</span>
                  <span className="text-cyan-400 font-bold">{camera.quality_score}%</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">MONITORED SEATS</span>
                  <span className="text-slate-300 truncate block text-[11px]">
                    {monitored.length > 0 ? monitored.map(s => s.replace('seat-', 'A')).join(', ') : 'All seats'}
                  </span>
                </div>
              </div>

              {/* Angle Description */}
              <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                <span className="truncate">{camera.view_angle_description || 'Surveillance perspective'}</span>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/60 text-xs">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleTestConnection(camera.camera_id)}
                    disabled={testingCameraId === camera.camera_id}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${testingCameraId === camera.camera_id ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>{testingCameraId === camera.camera_id ? 'Pinging...' : 'Test'}</span>
                  </button>

                  <button
                    onClick={() => openEditModal(camera)}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium transition-colors"
                  >
                    <Settings2 className="w-3 h-3 text-slate-400" />
                    <span>Edit</span>
                  </button>

                  {!isPrimary && (
                    <button
                      onClick={() => handleDelete(camera)}
                      className="p-1 rounded bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-800 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Remove Camera"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {!isPrimary ? (
                  <button
                    onClick={() => handleMakePrimary(camera.camera_id)}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-semibold transition-colors"
                  >
                    <Star className="w-3.5 h-3.5" />
                    <span>Set Primary</span>
                  </button>
                ) : (
                  <span className="flex items-center space-x-1 text-cyan-400 text-xs font-semibold">
                    <Check className="w-3.5 h-3.5" />
                    <span>Active Primary</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Camera Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <Video className="w-4 h-4 text-cyan-400" />
                <span>{editingCameraId ? 'Edit Camera Configuration' : 'Register New Camera'}</span>
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCamera} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Camera Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Classroom Camera 04 - Right Flank"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Source Protocol</label>
                  <select
                    value={formData.source_type}
                    onChange={e => setFormData({ ...formData, source_type: e.target.value as CameraSourceType })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="rtsp">RTSP IP Stream</option>
                    <option value="usb">USB Video / V4L2</option>
                    <option value="http">HTTP MJPEG</option>
                    <option value="demo">Synthetic Demo Stream</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Classroom Room ID</label>
                  <input
                    type="text"
                    required
                    value={formData.classroom_id}
                    onChange={e => setFormData({ ...formData, classroom_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Source URL / Hardware Path
                </label>
                <input
                  type="text"
                  required
                  value={formData.source_url}
                  onChange={e => setFormData({ ...formData, source_url: e.target.value })}
                  placeholder={formData.source_type === 'usb' ? '/dev/video0' : 'rtsp://192.168.1.104:554/stream'}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Width</label>
                  <input
                    type="number"
                    value={formData.width}
                    onChange={e => setFormData({ ...formData, width: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Height</label>
                  <input
                    type="number"
                    value={formData.height}
                    onChange={e => setFormData({ ...formData, height: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Target FPS</label>
                  <input
                    type="number"
                    value={formData.target_fps}
                    onChange={e => setFormData({ ...formData, target_fps: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">View Angle Description</label>
                <input
                  type="text"
                  value={formData.view_angle_description}
                  onChange={e => setFormData({ ...formData, view_angle_description: e.target.value })}
                  placeholder="e.g. Left oblique perspective verifying student desk surface"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Monitored Seats checkboxes */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Monitored Classroom Seats (Physical Association)
                </label>
                <div className="flex flex-wrap gap-2">
                  {seats.map(seat => {
                    const isMonitored = formData.monitored_seats.includes(seat.id);
                    return (
                      <button
                        type="button"
                        key={seat.id}
                        onClick={() => toggleSeatMonitoring(seat.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors ${
                          isMonitored
                            ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {seat.label} ({seat.id})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center space-x-6 pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-cyan-400 bg-slate-950"
                  />
                  <span className="text-slate-300 font-semibold">Enabled (Active Stream)</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_primary}
                    onChange={e => setFormData({ ...formData, is_primary: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-cyan-400 bg-slate-950"
                  />
                  <span className="text-slate-300 font-semibold">Set as Primary</span>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-md shadow-cyan-500/20"
                >
                  {editingCameraId ? 'Save Changes' : 'Add to Fleet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
