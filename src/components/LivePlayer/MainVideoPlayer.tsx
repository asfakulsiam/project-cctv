/**
 * Smart Classroom Exam Monitoring System
 * Main Video Player (Primary Camera & Focus Viewer)
 * 
 * CORE REQUIREMENT:
 * - Camera 1 must be the PRIMARY CAMERA and occupies the main large player area.
 * - Primary camera video must be clearly visible, responsive, resizable, zoomable,
 *   and optimized for visual inspection.
 * - Live bounding boxes with camera-safe unique IDs (e.g. CAM1-S001).
 * - Clicking any detected person allows inspecting the student's cross-camera observations.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { drawCameraFeed } from '../../utils/canvasRenderer.js';
import { resolveCameraStream } from '../../utils/streamHelper.js';
import { CameraTrack } from '../../types.js';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  Eye, 
  Sparkles, 
  WifiOff, 
  ChevronRight,
  ShieldAlert,
  AlertCircle,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RefreshCw,
  Video
} from 'lucide-react';

interface MainVideoPlayerProps {
  onInspectStudent?: (studentId: string) => void;
}

export function MainVideoPlayer({ onInspectStudent }: MainVideoPlayerProps) {
  const { 
    cameras, 
    focusedCameraId, 
    setFocusedCameraId,
    tracksByCamera, 
    students, 
    settings, 
    selectedTrack, 
    setSelectedTrack,
    setSelectedStudent,
    primaryCameraId
  } = useMonitoring();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mjpegRef = useRef<HTMLImageElement>(null);

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 960, height: 540 });

  // Stream state
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'playing' | 'paused' | 'error' | 'blocked' | 'offline'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [streamInfo, setStreamInfo] = useState<{ label: string; resolution: string }>({ label: '', resolution: '' });

  const focusedCamera = cameras.find(c => c.camera_id === focusedCameraId) || cameras[0];
  const tracks = tracksByCamera[focusedCameraId] || [];
  const isPrimary = focusedCamera?.camera_id === primaryCameraId;

  // Responsive ResizeObserver for crisp Canvas sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        // Maintain 16:9 aspect ratio
        const height = Math.round(width * (9 / 16));
        setCanvasDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Connect & Manage Camera Video Stream
  useEffect(() => {
    if (!focusedCamera || focusedCamera.status === 'offline' || focusedCamera.enabled === false) {
      setStreamStatus('offline');
      return;
    }

    const resolution = resolveCameraStream(focusedCamera);
    setStreamInfo({
      label: resolution.label,
      resolution: `${focusedCamera.resolution?.width || 1920}x${focusedCamera.resolution?.height || 1080}`
    });
    setStreamStatus('connecting');
    setErrorMessage(null);

    let activeStream: MediaStream | null = null;
    const videoEl = videoRef.current;
    const mjpegEl = mjpegRef.current;

    if (resolution.kind === 'webcam') {
      if (mjpegEl) mjpegEl.src = '';
      navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      }).then(stream => {
        activeStream = stream;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().then(() => {
            setStreamStatus('playing');
          }).catch(err => {
            if (err.name === 'NotAllowedError') {
              setStreamStatus('blocked');
            } else {
              setStreamStatus('error');
              setErrorMessage(err.message);
            }
          });
        }
      }).catch(err => {
        setStreamStatus('error');
        setErrorMessage(`Camera hardware access denied: ${err.message}`);
      });
    } else if (resolution.kind === 'mjpeg') {
      if (videoEl) {
        videoEl.pause();
        videoEl.srcObject = null;
        videoEl.src = '';
      }
      if (mjpegEl) {
        mjpegEl.src = resolution.streamUrl;
        mjpegEl.onload = () => setStreamStatus('playing');
        mjpegEl.onerror = () => {
          setStreamStatus('error');
          setErrorMessage('Failed to connect to IP webcam MJPEG stream. Ensure stream endpoint is online.');
        };
      }
    } else if (resolution.kind === 'gdrive' || resolution.kind === 'video') {
      if (mjpegEl) mjpegEl.src = '';
      if (videoEl) {
        videoEl.srcObject = null;
        videoEl.src = resolution.streamUrl;
        videoEl.crossOrigin = 'anonymous';
        videoEl.loop = true;
        videoEl.muted = isMuted;
        videoEl.playsInline = true;

        const handleCanPlay = () => {
          videoEl.play().then(() => {
            setStreamStatus('playing');
            if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
              setStreamInfo(prev => ({
                ...prev,
                resolution: `${videoEl.videoWidth}x${videoEl.videoHeight}`
              }));
            }
          }).catch(err => {
            if (err.name === 'NotAllowedError') {
              setStreamStatus('blocked');
            } else {
              setStreamStatus('error');
              setErrorMessage(err.message);
            }
          });
        };

        const handleError = () => {
          setStreamStatus('error');
          setErrorMessage('Could not decode video stream. Verifying direct access...');
        };

        videoEl.addEventListener('canplay', handleCanPlay, { once: true });
        videoEl.addEventListener('error', handleError, { once: true });
        videoEl.load();

        return () => {
          videoEl.removeEventListener('canplay', handleCanPlay);
          videoEl.removeEventListener('error', handleError);
        };
      }
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
      }
      if (videoEl) {
        videoEl.pause();
        videoEl.srcObject = null;
        videoEl.src = '';
      }
      if (mjpegEl) {
        mjpegEl.src = '';
      }
    };
  }, [focusedCamera?.camera_id, focusedCamera?.source_url, focusedCamera?.source_type, focusedCamera?.status, focusedCamera?.enabled]);

  // Animation Loop for live canvas rendering with real video feed
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas && focusedCamera && focusedCamera.status === 'online') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const videoEl = videoRef.current;
          const mjpegEl = mjpegRef.current;
          const isMjpeg = focusedCamera.source_type === 'ip_webcam' || (focusedCamera.source_url || '').includes(':8080');
          const activeSource = isMjpeg ? mjpegEl : videoEl;

          drawCameraFeed(
            ctx,
            {
              width: canvas.width,
              height: canvas.height,
              cameraName: focusedCamera.name,
              cameraId: focusedCamera.camera_id,
              isPrimary,
              tracks,
              students,
              zoomLevel,
              panOffset,
              selectedTrackId: selectedTrack?.track_id || null,
              highSuspicionThreshold: settings?.thresholds?.high_suspicion_threshold || 65,
              videoSource: activeSource
            },
            Date.now()
          );
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [focusedCamera, tracks, students, zoomLevel, panOffset, selectedTrack, settings, isPrimary]);

  // User playback trigger (for autoplay restrictions)
  const handleStartPlayback = () => {
    if (videoRef.current) {
      videoRef.current.play().then(() => {
        setStreamStatus('playing');
      }).catch(err => {
        setStreamStatus('error');
        setErrorMessage(err.message);
      });
    }
  };

  const handleTogglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setStreamStatus('playing'));
    } else {
      videoRef.current.pause();
      setStreamStatus('paused');
    }
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
  };

  const handleReloadStream = () => {
    if (!videoRef.current) return;
    setStreamStatus('connecting');
    setErrorMessage(null);
    videoRef.current.load();
    videoRef.current.play().then(() => setStreamStatus('playing')).catch(err => {
      setStreamStatus('error');
      setErrorMessage(err.message);
    });
  };

  // Zoom Controls
  const handleZoomIn = () => setZoomLevel(prev => Math.min(3.0, Math.round((prev + 0.25) * 100) / 100));
  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const next = Math.max(1.0, Math.round((prev - 0.25) * 100) / 100);
      if (next === 1.0) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };
  const handleResetView = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  // Pan dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1.0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1.0) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Click Canvas to Select / Inspect Track
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || zoomLevel > 1.2) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // Check if clicked inside any track's bounding box
    const hitTrack = tracks.find(t => 
      clickX >= t.bbox.x &&
      clickX <= (t.bbox.x + t.bbox.width) &&
      clickY >= t.bbox.y &&
      clickY <= (t.bbox.y + t.bbox.height)
    );

    if (hitTrack) {
      setSelectedTrack(hitTrack);
      if (hitTrack.associated_student_id) {
        const student = students.find(s => s.id === hitTrack.associated_student_id);
        if (student) {
          setSelectedStudent(student);
          onInspectStudent?.(student.id);
        }
      }
    } else {
      setSelectedTrack(null);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(err => console.error(err));
      setIsFullscreen(false);
    }
  };

  return (
    <div className="flex flex-col bg-slate-900 rounded-xl border border-slate-800 shadow-2xl overflow-hidden">
      
      {/* Hidden Video & Image elements for native hardware decoding */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted={isMuted}
        loop
        crossOrigin="anonymous"
        className="hidden"
      />
      <img
        ref={mjpegRef}
        crossOrigin="anonymous"
        alt="stream-frame"
        className="hidden"
      />

      {/* Player Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 gap-2">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm text-slate-100">
              {focusedCamera ? focusedCamera.name : 'Surveillance Monitor (0 Feeds)'}
            </span>
            {focusedCamera && (
              isPrimary ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  PRIMARY VIEW
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  FOCUSED ANGLE
                </span>
              )
            )}
          </div>
          {focusedCamera && streamInfo.label && (
            <>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-xs text-slate-400 font-mono hidden sm:inline flex items-center space-x-1">
                <Video className="w-3 h-3 text-cyan-400 inline" />
                <span>{streamInfo.label}</span>
              </span>
            </>
          )}
        </div>

        {/* Quick Camera Switcher Buttons */}
        {cameras.length > 1 && (
          <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
            {cameras.map(cam => {
              const isSelected = cam.camera_id === focusedCameraId;
              return (
                <button
                  key={cam.camera_id}
                  onClick={() => setFocusedCameraId(cam.camera_id)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-all ${
                    isSelected
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm ring-1 ring-cyan-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                  }`}
                  title={`Switch to ${cam.name} feed`}
                >
                  <span>{cam.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Playback, Zoom & Inspection Controls */}
        <div className="flex items-center space-x-1.5">
          {focusedCamera && focusedCamera.source_type !== 'webcam' && (
            <>
              <button
                onClick={handleTogglePlayPause}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors"
                title={streamStatus === 'paused' ? 'Resume Stream' : 'Pause Stream'}
              >
                {streamStatus === 'paused' ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4" />}
              </button>
              <button
                onClick={handleToggleMute}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors"
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
              </button>
              <button
                onClick={handleReloadStream}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors"
                title="Reload Stream Decoder"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <div className="h-4 w-px bg-slate-800 mx-1" />
            </>
          )}

          <button
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1.0}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400">
            {zoomLevel.toFixed(1)}x
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3.0}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetView}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors"
            title="Reset Zoom & Pan"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-slate-800 mx-1" />
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Player Area */}
      <div 
        ref={containerRef}
        className="relative w-full bg-black flex items-center justify-center overflow-hidden select-none cursor-crosshair"
        style={{ minHeight: '380px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {focusedCamera && focusedCamera.status === 'online' ? (
          <>
            <canvas
              ref={canvasRef}
              width={canvasDimensions.width}
              height={canvasDimensions.height}
              onClick={handleCanvasClick}
              className="cv-canvas block w-full h-auto"
            />

            {/* Overlay if browser requires click to autoplay */}
            {streamStatus === 'blocked' && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Play className="w-6 h-6 ml-0.5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100">Live Video Stream Ready</h4>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Browser policy requires user confirmation to initiate live media playback.
                  </p>
                </div>
                <button
                  onClick={handleStartPlayback}
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-2 transition-colors shadow-lg shadow-cyan-500/20"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Start Live Video Stream</span>
                </button>
              </div>
            )}

            {/* Overlay if video decode fails */}
            {streamStatus === 'error' && (
              <div className="absolute top-4 right-4 z-30 bg-rose-950/90 border border-rose-700/80 text-rose-200 text-xs p-3 rounded-lg shadow-xl max-w-md flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block">Video Stream Notice</span>
                  <p className="text-[11px] text-rose-300 leading-relaxed">
                    {errorMessage || 'Unable to decode stream. Verifying direct stream link...'}
                  </p>
                  <button
                    onClick={handleReloadStream}
                    className="mt-1 px-2 py-0.5 rounded bg-rose-800/60 hover:bg-rose-700 text-[10px] font-semibold text-white flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Stream</span>
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
            <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-3">
              <WifiOff className="w-7 h-7 text-rose-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-300">
              {focusedCamera ? `${focusedCamera.name} Offline` : 'No Cameras Registered'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              {focusedCamera 
                ? 'Live camera feed disconnected. Hardware stream standby or network link offline.' 
                : 'No camera streams configured in database. Register RTSP, Google Drive, or local camera endpoints in Admin.'}
            </p>
          </div>
        )}

        {/* Selected Track Overlay Hint */}
        {selectedTrack && (
          <div className="absolute bottom-4 left-4 z-20 bg-slate-950/90 border border-cyan-500/50 p-2.5 rounded-lg shadow-xl backdrop-blur-sm flex items-center space-x-3 text-xs">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <div>
              <span className="font-mono text-cyan-300 font-bold">{selectedTrack.track_id}</span>
              <span className="text-slate-400 ml-2">
                Suspicion: <strong className="text-white">{selectedTrack.suspicion_score}</strong>
              </span>
            </div>
            {selectedTrack.associated_student_id && (
              <button 
                onClick={() => onInspectStudent?.(selectedTrack.associated_student_id!)}
                className="ml-2 px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[10px] flex items-center space-x-1"
              >
                <span>Inspect Student</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Observation Priority & Perspective Context Bar */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center space-x-2">
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span>Active Perspective:</span>
          <span className="text-slate-200 font-medium">
            {focusedCamera?.view_angle_description || (cameras.length === 0 ? 'No active camera' : 'Surveillance perspective')}
          </span>
        </div>

        <div className="flex items-center space-x-4 font-mono text-[11px]">
          <span>Visible Tracks: <strong className="text-cyan-400">{tracks.length}</strong></span>
          <span className="text-slate-700">|</span>
          <span>
            Resolution: <strong className="text-slate-300">
              {streamInfo.resolution || (focusedCamera?.resolution ? `${focusedCamera.resolution.width}x${focusedCamera.resolution.height}` : '1920x1080')}
            </strong>
          </span>
        </div>
      </div>

    </div>
  );
}

