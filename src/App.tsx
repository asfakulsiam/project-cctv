import React, { useState, useEffect, useRef } from 'react';
import { Camera, Shield, Users, AlertTriangle, CheckCircle2, Activity, RefreshCw, Volume2, Eye } from 'lucide-react';
import { CameraConfig, ExamCandidate, ExamEvent, TelemetryPayload, Student } from './types.js';
import { renderCanvasOverlay } from './utils/canvasRenderer.js';

export default function App() {
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('cam-1');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect WebSocket & fallback polling
  useEffect(() => {
    let active = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connectWS = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!active) return;
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!active) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'TELEMETRY_UPDATE' || data.type === 'TELEMETRY_INIT') {
              setTelemetry(data.data);
            }
          } catch (e) {
            console.error('Error parsing telemetry payload', e);
          }
        };

        ws.onclose = () => {
          if (!active) return;
          setIsConnected(false);
          // Reconnect attempt after 2s
          setTimeout(connectWS, 2000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        setIsConnected(false);
      }
    };

    connectWS();

    // Fallback polling every 2s
    const pollInterval = setInterval(() => {
      fetch('/api/telemetry')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && active) {
            setTelemetry(data);
          }
        })
        .catch(() => {});
    }, 2000);

    return () => {
      active = false;
      clearInterval(pollInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Update canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !telemetry) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background hall rendering simulation
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Subtle perspective hall lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.7);
    ctx.lineTo(width, height * 0.7);
    ctx.stroke();

    const activeTracks = telemetry.tracks[selectedCameraId] || telemetry.candidates || [];
    renderCanvasOverlay(ctx, width, height, activeTracks);
  }, [telemetry, selectedCameraId]);

  const activeCamera = telemetry?.cameras?.find((c) => c.camera_id === selectedCameraId) || telemetry?.cameras?.[0];

  const handleClearWarning = async (personId: string) => {
    setIsProcessing(true);
    try {
      await fetch(`/api/candidates/${personId}/clear-warning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      // Refresh telemetry
      const res = await fetch('/api/telemetry');
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">Smart Classroom Exam Monitoring System</h1>
            <p className="text-xs text-slate-400">YOLOv8 Computer Vision & Floating Nameplate Tracking</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-full text-xs">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-slate-300">{isConnected ? 'Live Telemetry' : 'Connecting...'}</span>
          </div>

          <div className="text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-full">
            FPS: <span className="text-blue-400 font-mono font-medium">{telemetry?.fps || '7.2'}</span>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto w-full">
        {/* Left Column: Video Feed & Dynamic Canvas */}
        <section className="lg:col-span-3 flex flex-col space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center space-x-2">
                <Camera className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-slate-200">{activeCamera?.name || 'Exam Hall Camera'}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {activeCamera?.status || 'Online'}
                </span>
              </div>

              {/* Camera Switcher */}
              <div className="flex space-x-1">
                {telemetry?.cameras?.map((cam) => (
                  <button
                    key={cam.camera_id}
                    onClick={() => setSelectedCameraId(cam.camera_id)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      selectedCameraId === cam.camera_id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {cam.name.replace('CCTV Camera ', 'Cam ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Video Canvas Container */}
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              <canvas
                ref={canvasRef}
                width={854}
                height={480}
                className="w-full h-full object-contain"
              />
              <div className="absolute top-3 left-3 bg-slate-950/70 backdrop-blur px-2.5 py-1 rounded text-[11px] text-slate-300 border border-slate-800 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span>REC LIVE</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Active Cameras</span>
                <Camera className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-white">{telemetry?.stats?.online_cameras ?? 1}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Detected Students</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-white">{telemetry?.candidates?.length ?? 3}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Active Warnings</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-white">{telemetry?.stats?.warning_count ?? 0}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>System Health</span>
                <Activity className="w-4 h-4 text-cyan-400" />
              </div>
              <p className="text-lg font-bold text-emerald-400 capitalize">{telemetry?.stats?.system_health ?? 'Optimal'}</p>
            </div>
          </div>
        </section>

        {/* Right Column: Live Candidates & Behavioral Alerts */}
        <section className="flex flex-col space-y-4">
          {/* Detected Exam Candidates */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span>Tracked Candidates</span>
              </h2>
              <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                {telemetry?.candidates?.length ?? 0}
              </span>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-[380px] flex-1">
              {(telemetry?.candidates || []).map((cand) => (
                <div
                  key={cand.person_id}
                  className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-colors"
                >
                  <div>
                    <p className="text-xs font-medium text-slate-200">
                      {cand.student_name || cand.person_id}
                    </p>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                      <span>ID: {cand.student_id_number || 'Auto-Detected'}</span>
                      <span>•</span>
                      <span className={cand.warning_active ? 'text-amber-400' : 'text-emerald-400'}>
                        {cand.warning_active ? 'Warning Active' : 'Normal'}
                      </span>
                    </div>
                  </div>

                  {cand.warning_active && (
                    <button
                      onClick={() => handleClearWarning(cand.person_id)}
                      disabled={isProcessing}
                      className="px-2.5 py-1 text-xs rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              ))}

              {(!telemetry?.candidates || telemetry.candidates.length === 0) && (
                <div className="text-center py-8 text-xs text-slate-500">
                  Searching for students in camera views...
                </div>
              )}
            </div>
          </div>

          {/* Real-Time Activity Log */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-56 flex flex-col">
            <h2 className="text-sm font-semibold text-slate-200 pb-2 border-b border-slate-800 mb-2 flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Audit Log</span>
            </h2>
            <div className="overflow-y-auto space-y-2 flex-1 text-xs">
              {(telemetry?.recent_events || []).map((evt) => (
                <div key={evt.id} className="text-slate-300 flex items-start space-x-2 py-1 border-b border-slate-800/40">
                  <span className="text-[10px] text-slate-500 whitespace-nowrap mt-0.5">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="flex-1 text-slate-300">{evt.description}</span>
                </div>
              ))}
              {(!telemetry?.recent_events || telemetry.recent_events.length === 0) && (
                <div className="text-center py-6 text-xs text-slate-500">
                  All systems operational. No abnormal events recorded.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
