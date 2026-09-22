/**
 * Smart Classroom Exam Monitoring System
 * Main Video Player (Primary Camera & Focus Viewer)
 * 
 * CORE REQUIREMENTS:
 * - Camera 1 is the PRIMARY CAMERA and occupies the main large player area.
 * - Primary camera video is clearly visible, responsive, resizable, zoomable,
 *   and optimized for visual inspection.
 * - Live bounding boxes with fixed individual IDs (e.g. CAM1-S001) and suspicion scores (0 - 100).
 * - WARNING turns bounding boxes and badges YELLOW (#eab308 / #fbbf24).
 * - CRITICAL ALERT turns bounding boxes and badges RED (#ef4444).
 * - UI Fallback displayed whenever a camera stream is offline or fails to decode.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { useScreenWakeLock } from '../../hooks/useScreenWakeLock.js';
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
  Video,
  Camera,
  Scan,
  ExternalLink,
  Layers,
  Settings
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
    seats,
    selectedTrack, 
    setSelectedTrack,
    setSelectedStudent,
    primaryCameraId,
    updateCameraConfig
  } = useMonitoring();

  const isDemoMode = (import.meta as any).env?.VITE_DEMO_MODE === 'true';

  const [isDrivePreviewMode, setIsDrivePreviewMode] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mjpegRef = useRef<HTMLImageElement>(null);

  // Framing mode: contain (Auto Frame - Best View) or cover (Fill Screen)
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');

  // Phone Camera Facing (Rear/Back vs Front camera) - defaults to Rear (environment)
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('preferred_camera_facing') as 'environment' | 'user') || 'environment';
    }
    return 'environment';
  });

  const handleToggleCameraFacing = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred_camera_facing', nextFacing);
    }
  };

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
  const [liveTrackCount, setLiveTrackCount] = useState<number>(0);

  const focusedCamera = cameras.find(c => c.camera_id === focusedCameraId) || cameras[0];
  const tracks = tracksByCamera[focusedCameraId] || [];
  const isPrimary = focusedCamera?.camera_id === primaryCameraId;
  const streamResolution = resolveCameraStream(focusedCamera);

  // Apple HIG Screen Wake Lock: Keep display active while video is playing
  const { isLocked: isScreenAwake } = useScreenWakeLock({
    isPlaying: streamStatus === 'playing',
    title: focusedCamera?.name || 'Examination Surveillance',
    subtitle: 'Proctor-CV Academic Monitoring',
    onPlay: () => {
      if (videoRef.current) videoRef.current.play().catch(() => {});
    },
    onPause: () => {
      if (videoRef.current) videoRef.current.pause();
    }
  });

  // Stable refs to decouple the 60fps canvas render loop from React state re-render thrashing
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const studentsRef = useRef(students);
  studentsRef.current = students;
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;
  const panOffsetRef = useRef(panOffset);
  panOffsetRef.current = panOffset;
  const selectedTrackRef = useRef(selectedTrack);
  selectedTrackRef.current = selectedTrack;
  const isPrimaryRef = useRef(isPrimary);
  isPrimaryRef.current = isPrimary;
  const fitModeRef = useRef(fitMode);
  fitModeRef.current = fitMode;

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
    let isCancelled = false;
    const videoEl = videoRef.current;
    const mjpegEl = mjpegRef.current;

    if (resolution.kind === 'webcam') {
      if (mjpegEl) mjpegEl.src = '';
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: cameraFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      navigator.mediaDevices.getUserMedia(constraints)
        .catch(() => {
          // Hardware fallback if specific lens constraint fails
          return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        })
        .then(stream => {
          if (isCancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          activeStream = stream;
          if (videoEl) {
            videoEl.srcObject = stream;
            videoEl.play().then(() => {
              if (!isCancelled) {
                setStreamStatus('playing');
                if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
                  setStreamInfo(prev => ({
                    ...prev,
                    resolution: `${videoEl.videoWidth}x${videoEl.videoHeight}`
                  }));
                }
              }
            }).catch(err => {
              if (isCancelled) return;
              if (err.name === 'NotAllowedError') {
                setStreamStatus('blocked');
              } else {
                setStreamStatus('error');
                setErrorMessage(err.message);
              }
            });
          }
        }).catch(err => {
          if (isCancelled) return;
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
          setErrorMessage('Failed to connect to IP webcam MJPEG stream. Ensure camera server is broadcasting.');
        };
      }
    } else if (resolution.kind === 'gdrive' || resolution.kind === 'video') {
      if (mjpegEl) mjpegEl.src = '';
      if (videoEl) {
        videoEl.srcObject = null;
        videoEl.defaultMuted = true;
        videoEl.muted = isMuted;
        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.crossOrigin = 'anonymous';
        videoEl.src = resolution.streamUrl;

        const attemptPlay = () => {
          videoEl.play().then(() => {
            if (isCancelled) return;
            setStreamStatus('playing');
            if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
              setStreamInfo(prev => ({
                ...prev,
                resolution: `${videoEl.videoWidth}x${videoEl.videoHeight}`
              }));
            }
          }).catch(err => {
            if (isCancelled) return;
            if (err.name === 'NotAllowedError') {
              // Try muted autoplay first as required by browser policy
              videoEl.muted = true;
              videoEl.defaultMuted = true;
              setIsMuted(true);
              videoEl.play().then(() => {
                if (!isCancelled) setStreamStatus('playing');
              }).catch(() => {
                if (!isCancelled) setStreamStatus('blocked');
              });
            } else {
              setStreamStatus('error');
              setErrorMessage(err.message);
            }
          });
        };

        const handleCanPlay = () => {
          attemptPlay();
        };

        const handleError = () => {
          console.warn('[MainVideoPlayer] Stream decode issue on URL:', videoEl.src);
          setStreamStatus('error');
          if (resolution.kind === 'gdrive') {
            setErrorMessage('Unable to stream video from Google Drive link directly. File sharing must be "Anyone with link can view", or Google download quota is restricted.');
          } else {
            setErrorMessage('Could not decode video stream. Stream may be offline or URL format is unsupported.');
          }
        };

        videoEl.addEventListener('loadedmetadata', handleCanPlay);
        videoEl.addEventListener('canplay', handleCanPlay);
        videoEl.addEventListener('loadeddata', handleCanPlay);
        videoEl.addEventListener('error', handleError);

        videoEl.load();

        if (videoEl.readyState >= 1) {
          handleCanPlay();
        }

        return () => {
          videoEl.removeEventListener('loadedmetadata', handleCanPlay);
          videoEl.removeEventListener('canplay', handleCanPlay);
          videoEl.removeEventListener('loadeddata', handleCanPlay);
          videoEl.removeEventListener('error', handleError);
        };
      }
    }

    return () => {
      isCancelled = true;
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
  }, [focusedCamera?.camera_id, focusedCamera?.source_url, focusedCamera?.source_type, focusedCamera?.status, focusedCamera?.enabled, cameraFacing]);

  // Animation Loop for live canvas rendering with real video feed and real-time movement tracking
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
          const now = Date.now();

          // Authoritative Server Tracks: browser is purely a viewer
          // Displays verified tracks received via server WebSocket telemetry
          const effectiveTracks = tracksRef.current || [];
          if (effectiveTracks.length !== liveTrackCount) {
            setLiveTrackCount(effectiveTracks.length);
          }

          drawCameraFeed(
            ctx,
            {
              width: canvas.width,
              height: canvas.height,
              cameraName: focusedCamera.name,
              cameraId: focusedCamera.camera_id,
              isPrimary: isPrimaryRef.current,
              tracks: effectiveTracks,
              students: studentsRef.current,
              zoomLevel: zoomLevelRef.current,
              panOffset: panOffsetRef.current,
              selectedTrackId: selectedTrackRef.current?.track_id || null,
              highSuspicionThreshold: settingsRef.current?.thresholds?.high_suspicion_threshold || 65,
              videoSource: activeSource,
              fitMode: fitModeRef.current
            },
            now
          );
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [focusedCamera?.camera_id, focusedCamera?.status]);

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
  const handleZoomIn = () => setZoomLevel(prev => Math.min(3.0, Number((prev + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(1.0, Number((prev - 0.25).toFixed(2))));
  const handleResetView = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  // Pan interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1.0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1.0) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Handle Canvas click to select a track
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left - panOffset.x) / zoomLevel) / canvas.width;
    const clickY = ((e.clientY - rect.top - panOffset.y) / zoomLevel) / canvas.height;

    const effectiveTracks = tracks;
    const hitTrack = effectiveTracks.find(t => 
      clickX >= t.bbox.x &&
      clickX <= t.bbox.x + t.bbox.width &&
      clickY >= t.bbox.y &&
      clickY <= t.bbox.y + t.bbox.height
    );

    if (hitTrack) {
      setSelectedTrack(hitTrack);
      if (hitTrack.associated_student_id) {
        const foundStudent = students.find(s => s.id === hitTrack.associated_student_id) || null;
        setSelectedStudent(foundStudent);
      }
    } else {
      setSelectedTrack(null);
    }
  };

  const isStreamDead = streamStatus === 'error' || streamStatus === 'offline' || (focusedCamera && focusedCamera.status === 'offline');

  return (
    <div className="surface-card border border-[var(--system-chrome-border)] rounded-[14px] overflow-hidden flex flex-col shadow-sm">
      {/* Header bar - Apple HIG Minimal Toolbar */}
      <div className="px-4 py-2.5 bg-[var(--system-secondary-bg)] border-b border-[var(--system-separator)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${
              streamStatus === 'playing' ? 'bg-[var(--system-success)] animate-pulse' : 
              streamStatus === 'connecting' ? 'bg-[var(--system-warning)] animate-spin' : 
              'bg-[var(--system-destructive)]'
            }`} />
            <h3 className="font-semibold text-[13px] text-[var(--system-text-primary)]">
              {focusedCamera?.name || 'Primary Surveillance Feed'}
            </h3>
          </div>

          {isPrimary && (
            <span className="badge-apple bg-[var(--system-accent-subtle)] text-[var(--system-accent)] border border-[var(--system-accent)]/20 text-[10px] font-semibold">
              PRIMARY
            </span>
          )}

          <span className="text-[11px] font-mono-apple text-[var(--system-text-secondary)] px-2 py-0.5 rounded-[6px] bg-[var(--system-fill)]">
            {streamInfo.label || 'Direct Optical Feed'}
          </span>
        </div>

        {/* Player Controls & Zoom Bar */}
        <div className="flex items-center space-x-1">
          {/* Flip Front/Back Camera Lens for Webcams */}
          {focusedCamera && (focusedCamera.source_type === 'webcam' || (focusedCamera.source_url || '').startsWith('webcam:')) && (
            <button
              onClick={handleToggleCameraFacing}
              className="px-2.5 py-1 rounded-[8px] hover:bg-[var(--system-fill)] flex items-center space-x-1.5 text-[12px] font-medium text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] transition-colors cursor-pointer border border-[var(--system-chrome-border)]"
              title={`Switch camera lens (Current: ${cameraFacing === 'environment' ? 'Rear/Back Camera' : 'Front Selfie Camera'})`}
            >
              <Camera className="w-3.5 h-3.5 text-[var(--system-accent)]" />
              <span>{cameraFacing === 'environment' ? 'Rear Lens' : 'Front Lens'}</span>
            </button>
          )}

          {focusedCamera && focusedCamera.source_type !== 'webcam' && !(focusedCamera.source_url || '').startsWith('webcam:') && (
            <>
              <button
                onClick={handleTogglePlayPause}
                className="w-8 h-8 rounded-[8px] hover:bg-[var(--system-fill)] flex items-center justify-center text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] transition-colors cursor-pointer"
                title={streamStatus === 'paused' ? 'Resume Stream' : 'Pause Stream'}
              >
                {streamStatus === 'paused' ? <Play className="w-4 h-4 text-[var(--system-success)] fill-current" /> : <Pause className="w-4 h-4" />}
              </button>
              <button
                onClick={handleToggleMute}
                className="w-8 h-8 rounded-[8px] hover:bg-[var(--system-fill)] flex items-center justify-center text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] transition-colors cursor-pointer"
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-[var(--system-text-tertiary)]" /> : <Volume2 className="w-4 h-4 text-[var(--system-accent)]" />}
              </button>
              <button
                onClick={handleReloadStream}
                className="w-8 h-8 rounded-[8px] hover:bg-[var(--system-fill)] flex items-center justify-center text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] transition-colors cursor-pointer"
                title="Reload Stream Decoder"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <div className="h-4 w-px bg-[var(--system-separator)] mx-1" />
            </>
          )}

          {streamResolution.previewUrl && (
            <button
              onClick={() => setIsDrivePreviewMode(prev => !prev)}
              className={`px-2.5 py-1 rounded-[8px] text-[12px] font-medium flex items-center space-x-1.5 transition-all cursor-pointer ${
                isDrivePreviewMode
                  ? 'bg-[var(--system-accent)] text-white font-semibold shadow-sm'
                  : 'bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] text-[var(--system-text-secondary)] border border-[var(--system-chrome-border)]'
              }`}
              title="Toggle between Direct CCTV Engine (AI Bounding Boxes) and Native Drive Player"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isDrivePreviewMode ? 'Native Drive' : 'CCTV Engine'}</span>
            </button>
          )}

          {/* Auto Frame Toggle */}
          <button
            onClick={() => setFitMode(prev => prev === 'contain' ? 'cover' : 'contain')}
            className={`px-2.5 py-1 rounded-[8px] text-[12px] font-medium flex items-center space-x-1.5 transition-all cursor-pointer ${
              fitMode === 'contain'
                ? 'bg-[var(--system-success-subtle)] text-[var(--system-success)] border border-[var(--system-success)]/20 shadow-sm'
                : 'bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] text-[var(--system-text-secondary)] border border-[var(--system-chrome-border)]'
            }`}
            title={fitMode === 'contain' ? 'Auto Frame Best View (Active)' : 'Fill Screen'}
          >
            <Scan className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{fitMode === 'contain' ? 'Auto Frame' : 'Fill'}</span>
          </button>

          <button
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1.0}
            className="w-8 h-8 rounded-[8px] hover:bg-[var(--system-fill)] flex items-center justify-center text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] disabled:opacity-30 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-mono-apple px-2 py-0.5 rounded-[6px] bg-[var(--system-fill)] text-[var(--system-accent)] font-semibold">
            {zoomLevel.toFixed(1)}x
          </span>

          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3.0}
            className="w-8 h-8 rounded-[8px] hover:bg-[var(--system-fill)] flex items-center justify-center text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] disabled:opacity-30 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleResetView}
            className="w-8 h-8 rounded-[8px] hover:bg-[var(--system-fill)] flex items-center justify-center text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] transition-colors cursor-pointer"
            title="Reset Zoom & Pan"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-[var(--system-separator)] mx-1" />

          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-[8px] hover:bg-[var(--system-fill)] flex items-center justify-center text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Player Area */}
      <div 
        ref={containerRef}
        className="relative w-full aspect-video bg-slate-950 flex items-center justify-center overflow-hidden select-none cursor-crosshair"
        style={{ minHeight: '380px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {focusedCamera && focusedCamera.status === 'online' && !isStreamDead ? (
          <>
            {/* Native Google Drive Preview Player */}
            {isDrivePreviewMode && streamResolution.previewUrl ? (
              <iframe
                src={streamResolution.previewUrl}
                title="Google Drive Video Player"
                className="absolute inset-0 w-full h-full border-0 z-20"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : null}

            {/* Direct Hardware Video Stream */}
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted={isMuted}
              loop
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none z-0"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                transformOrigin: 'center center',
                display: isDrivePreviewMode || focusedCamera.source_type === 'ip_webcam' || (focusedCamera.source_url || '').includes(':8080') ? 'none' : 'block'
              }}
            />

            {/* MJPEG Stream for IP Webcams */}
            <img
              ref={mjpegRef}
              crossOrigin="anonymous"
              alt="stream-frame"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none z-0"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                transformOrigin: 'center center',
                display: !isDrivePreviewMode && (focusedCamera.source_type === 'ip_webcam' || (focusedCamera.source_url || '').includes(':8080')) ? 'block' : 'none'
              }}
            />

            {/* Computer Vision AI Detection Overlay Canvas */}
            {!isDrivePreviewMode && (
              <canvas
                ref={canvasRef}
                width={canvasDimensions.width}
                height={canvasDimensions.height}
                onClick={handleCanvasClick}
                className="cv-canvas absolute inset-0 w-full h-full object-contain z-10 pointer-events-auto cursor-crosshair"
              />
            )}

            {/* Autoplay blocked overlay */}
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
          </>
        ) : (
          /* High-Craft UI Fallback for Camera Dead / Unable to Stream */
          <div className="relative z-30 w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-950 text-slate-300">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-amber-500/30 flex items-center justify-center mb-4 shadow-xl shadow-amber-500/5">
              <AlertCircle className="w-8 h-8 text-amber-400" />
            </div>

            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-950/70 border border-amber-800/80 text-amber-300 text-[11px] font-mono mb-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>STREAM UNAVAILABLE / ACCESS NOTICE</span>
            </div>

            <h3 className="text-lg font-bold text-white mb-1">
              {focusedCamera ? focusedCamera.name : 'No Camera Feed Selected'}
            </h3>

            <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
              {errorMessage || (
                focusedCamera?.source_url?.includes('drive.google.com')
                  ? 'The Google Drive stream is currently unavailable or direct downloading is restricted. Ensure sharing is set to "Anyone with the link can view", or use the native embed player.'
                  : 'Unable to connect to camera endpoint. The hardware device may be offline or unreachable on the current network.'
              )}
            </p>

            {/* Actionable Fallback Controls */}
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
              {streamResolution.previewUrl && (
                <button
                  onClick={() => {
                    setIsDrivePreviewMode(true);
                    setStreamStatus('playing');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Use Google Drive Native Player</span>
                </button>
              )}

              <button
                onClick={handleReloadStream}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs flex items-center space-x-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>

              {focusedCamera && (
                <>
                  <button
                    onClick={() => updateCameraConfig(focusedCamera.camera_id, { source_type: 'webcam', source_url: 'webcam:default', status: 'online' })}
                    className="px-3.5 py-2 rounded-xl bg-indigo-900/90 hover:bg-indigo-800 border border-indigo-700/80 text-indigo-200 font-semibold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Switch to Webcam</span>
                  </button>

                  {isDemoMode && (
                    <button
                      onClick={() => updateCameraConfig(focusedCamera.camera_id, { source_type: 'stream', source_url: '/api/video/sample', status: 'online' })}
                      className="px-3.5 py-2 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-800/80 text-cyan-300 font-semibold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Load Demo CCTV Sample</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Selected Track Overlay Hint */}
        {selectedTrack && (
          <div className="absolute bottom-4 left-4 z-20 bg-slate-950/90 border border-cyan-500/50 p-2.5 rounded-lg shadow-xl backdrop-blur-sm flex items-center space-x-3 text-xs">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <div>
              <span className="font-mono text-cyan-300 font-bold">
                {selectedTrack.global_person_id || selectedTrack.person_id || selectedTrack.track_id}
              </span>
              <span className="text-slate-400 ml-2">
                Track: <span className="font-mono text-slate-300">{selectedTrack.track_id}</span>
              </span>
              <span className="text-slate-400 ml-2">
                Score: <strong className="text-white">{selectedTrack.current_score ?? selectedTrack.suspicion_score}</strong>
              </span>
            </div>
            {onInspectStudent && (
              <button 
                onClick={() => onInspectStudent(selectedTrack.associated_student_id || selectedTrack.global_person_id || selectedTrack.track_id)}
                className="ml-2 px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[10px] flex items-center space-x-1"
              >
                <span>Inspect Subject</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Observation Priority & Perspective Context Bar - Apple HIG Inset Bar */}
      <div className="px-4 py-2.5 bg-[var(--system-tertiary-bg)] border-t border-[var(--system-separator)] flex flex-wrap items-center justify-between text-[12px] text-[var(--system-text-secondary)] gap-2">
        <div className="flex items-center space-x-2">
          <Eye className="w-3.5 h-3.5 text-[var(--system-accent)]" />
          <span>Active Perspective:</span>
          <span className="text-[var(--system-text-primary)] font-medium">
            {focusedCamera?.view_angle_description || (cameras.length === 0 ? 'No active camera' : 'Surveillance perspective')}
          </span>
        </div>

        <div className="flex items-center space-x-3 font-mono-apple text-[11px]">
          <span>Visible Tracks: <strong className="text-[var(--system-accent)]">{liveTrackCount}</strong></span>
          <span className="text-[var(--system-text-quaternary)]">|</span>
          <span>
            Resolution: <strong className="text-[var(--system-text-primary)]">
              {streamInfo.resolution || (focusedCamera?.resolution ? `${focusedCamera.resolution.width}x${focusedCamera.resolution.height}` : '1920x1080')}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}
