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
import { useScreenWakeLock } from '../../hooks/useScreenWakeLock.js';
import { drawCameraFeed } from '../../utils/canvasRenderer.js';
import { resolveCameraStream } from '../../utils/streamHelper.js';
import { MotionVisionDetector } from '../../utils/motionVisionDetector.js';
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
  Sun
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
    primaryCameraId,
    broadcastDetections,
    updateCameraConfig
  } = useMonitoring();

  const [isDrivePreviewMode, setIsDrivePreviewMode] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mjpegRef = useRef<HTMLImageElement>(null);

  // Client-Side Optical Vision & Motion Detector
  const detectorRef = useRef<MotionVisionDetector>(new MotionVisionDetector());
  const lastDetectionTimeRef = useRef<number>(0);
  const liveTracksRef = useRef<CameraTrack[]>([]);
  const lastBroadcastTimeRef = useRef<number>(0);

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
  const broadcastDetectionsRef = useRef(broadcastDetections);
  broadcastDetectionsRef.current = broadcastDetections;

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
          setErrorMessage('Failed to connect to IP webcam MJPEG stream. Ensure stream endpoint is online.');
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

        let hasAttemptedFallback = false;

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
          if (!hasAttemptedFallback && videoEl.src && !videoEl.src.includes('/api/video/sample')) {
            hasAttemptedFallback = true;
            console.info('[MainVideoPlayer] Auto-switching to resilient surveillance CCTV feed.');
            videoEl.src = '/api/video/sample';
            videoEl.load();
            attemptPlay();
            return;
          }
          setStreamStatus('error');
          setErrorMessage('Could not decode video stream. Switch to Webcam or edit camera settings.');
        };

        videoEl.addEventListener('loadedmetadata', handleCanPlay);
        videoEl.addEventListener('canplay', handleCanPlay);
        videoEl.addEventListener('loadeddata', handleCanPlay);
        videoEl.addEventListener('error', handleError);
        videoEl.load();

        // If media was already cached/buffered
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
      detectorRef.current.reset();
      liveTracksRef.current = [];
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

          // Client-Side Real-Time Optical Motion & Person Detection (~10 FPS)
          if (now - lastDetectionTimeRef.current >= 95 && activeSource) {
            lastDetectionTimeRef.current = now;
            try {
              const detectedTracks = detectorRef.current.processFrame(activeSource, focusedCamera.camera_id);
              if (detectedTracks && detectedTracks.length > 0) {
                liveTracksRef.current = detectedTracks;
                // Throttled broadcast to global context & server to prevent React re-render thrashing
                if (now - lastBroadcastTimeRef.current >= 750) {
                  lastBroadcastTimeRef.current = now;
                  broadcastDetectionsRef.current(focusedCamera.camera_id, detectedTracks);
                }
              }
            } catch {
              // ignore frame read exceptions
            }
          }

          // Use live client detections immediately for instantaneous, smooth tracking overlay
          const effectiveTracks = liveTracksRef.current.length > 0 
            ? liveTracksRef.current 
            : tracksRef.current;

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
    <div className="flex flex-col bg-[var(--system-secondary-bg)] rounded-[20px] border border-[var(--system-card-border)] shadow-[var(--system-shadow-md)] overflow-hidden transition-all">
      {/* Player Header Bar - Apple HIG Frosted Glass */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-[var(--system-chrome-bg)] backdrop-blur-xl border-b border-[var(--system-chrome-border)] gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-[14px] text-[var(--system-text-primary)]">
              {focusedCamera ? focusedCamera.name : 'Surveillance Monitor'}
            </span>
            {focusedCamera && (
              isPrimary ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--system-accent-subtle)] text-[var(--system-accent)] border border-[var(--system-accent)]/20">
                  PRIMARY
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--system-fill)] text-[var(--system-text-secondary)] border border-[var(--system-chrome-border)]">
                  FOCUSED
                </span>
              )
            )}
            {isScreenAwake && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-mono-apple font-medium bg-[var(--system-accent-subtle)] text-[var(--system-accent)] border border-[var(--system-accent)]/20 flex items-center space-x-1"
                title="Screen Wake Lock: Display will remain on while playing"
              >
                <Sun className="w-2.5 h-2.5" />
                <span className="hidden xs:inline">Awake</span>
              </span>
            )}
          </div>
          {focusedCamera && streamInfo.label && (
            <>
              <span className="text-[var(--system-text-tertiary)] hidden sm:inline">•</span>
              <span className="text-[12px] text-[var(--system-text-secondary)] font-mono-apple hidden sm:inline flex items-center space-x-1">
                <Video className="w-3 h-3 text-[var(--system-accent)] inline" />
                <span>{streamInfo.label}</span>
              </span>
            </>
          )}
        </div>

        {/* Quick Camera Switcher Pills */}
        {cameras.length > 1 && (
          <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
            {cameras.map(cam => {
              const isSelected = cam.camera_id === focusedCameraId;
              return (
                <button
                  key={cam.camera_id}
                  onClick={() => setFocusedCameraId(cam.camera_id)}
                  className={`px-2.5 py-1 rounded-[8px] text-[12px] font-medium flex items-center space-x-1 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--system-accent)] text-white font-semibold shadow-sm'
                      : 'bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] border border-[var(--system-chrome-border)]'
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
        <div className="flex items-center space-x-1">
          {focusedCamera && (focusedCamera.source_type === 'webcam' || (focusedCamera.source_url || '').startsWith('webcam:')) && (
            <button
              onClick={handleToggleCameraFacing}
              className="px-2.5 py-1 rounded-[8px] bg-[var(--system-accent-subtle)] hover:bg-[var(--system-fill-secondary)] text-[var(--system-accent)] border border-[var(--system-accent)]/20 text-[12px] font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Flip between Phone Rear/Back Camera (CCTV) and Front Selfie Camera"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{cameraFacing === 'environment' ? 'Rear Cam' : 'Front Cam'}</span>
            </button>
          )}

          {focusedCamera && focusedCamera.source_type !== 'webcam' && (
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
              <span>{isDrivePreviewMode ? 'Native Drive' : 'CCTV Engine'}</span>
            </button>
          )}

          {/* Auto Frame (Best View) Aspect Ratio Preservation Toggle */}
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
        {focusedCamera && focusedCamera.status === 'online' ? (
          <>
            {/* Native Google Drive Preview Player (if requested by user) */}
            {isDrivePreviewMode && streamResolution.previewUrl ? (
              <iframe
                src={streamResolution.previewUrl}
                title="Google Drive Video Player"
                className="absolute inset-0 w-full h-full border-0 z-20"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : null}

            {/* Direct Hardware Video Stream (Plays smoothly underneath the AI telemetry canvas) */}
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
              <div className="absolute top-4 right-4 z-30 bg-slate-900/95 border border-amber-600/70 text-slate-200 text-xs p-3.5 rounded-xl shadow-2xl max-w-md flex items-start space-x-2.5 backdrop-blur-md">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <span className="font-bold block text-white">Stream Notice</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {errorMessage || 'Unable to decode stream directly.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      onClick={handleReloadStream}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-white flex items-center space-x-1 border border-slate-700"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                    {focusedCamera && (
                      <>
                        <button
                          onClick={() => updateCameraConfig(focusedCamera.camera_id, { source_type: 'stream', source_url: '/api/video/sample' })}
                          className="px-2 py-1 rounded bg-cyan-900/80 hover:bg-cyan-800 border border-cyan-700 text-cyan-200 text-[10px] font-semibold"
                        >
                          📹 Switch to Resilient CCTV
                        </button>
                        <button
                          onClick={() => updateCameraConfig(focusedCamera.camera_id, { source_type: 'webcam', source_url: 'webcam:default' })}
                          className="px-2 py-1 rounded bg-indigo-900/80 hover:bg-indigo-800 border border-indigo-700 text-indigo-200 text-[10px] font-semibold"
                        >
                          💻 Switch to Webcam
                        </button>
                      </>
                    )}
                  </div>
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
          <span>Visible Tracks: <strong className="text-[var(--system-accent)]">{tracks.length}</strong></span>
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

