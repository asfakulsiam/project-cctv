/**
 * src/components/MainPlayer.tsx - Real-Time Video Monitor & Overlay Renderer
 * Controls HTML5 video playback, webcam acquisition, frame detection loop execution,
 * SVG bounding box rendering with P-ID labels, and real-time activity log feeding.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Sliders,
  AlertTriangle,
  RefreshCw,
  Video,
  Upload,
  Link,
  Camera,
  Activity,
  UserCheck,
  CheckCircle,
  XCircle,
  Zap,
  Cloud,
} from 'lucide-react';
import {
  CameraSource,
  DetectionOverlayItem,
  Candidate,
  ActivityRecord,
  SystemDiagnostics,
  WarningLevel,
} from '../types.js';
import { visionDetector } from '../services/realDetector.js';
import { resolveSourceUrl, parseCloudVideoLink } from '../utils/sourceResolver.js';
import { validateVideoUrl, VideoValidationResult } from '../utils/videoLinkHandler.js';

interface MainPlayerProps {
  cameras: CameraSource[];
  selectedCamera: CameraSource | null;
  onSelectCamera: (cam: CameraSource) => void;
  onNewActivity: (activity: ActivityRecord) => void;
  onUpdateCandidates: (candidates: Candidate[]) => void;
  diagnostics: SystemDiagnostics | null;
  onUpdateDiagnostics: (diag: SystemDiagnostics) => void;
}

export const MainPlayer: React.FC<MainPlayerProps> = ({
  cameras,
  selectedCamera,
  onSelectCamera,
  onNewActivity,
  onUpdateCandidates,
  diagnostics,
  onUpdateDiagnostics,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const isLoopingRef = useRef<boolean>(false);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [detectionActive, setDetectionActive] = useState<boolean>(true);

  // Overlay visibility settings
  const [showNameplates, setShowNameplates] = useState<boolean>(true);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);

  // Tracking state from Real Vision Engine
  const [detections, setDetections] = useState<DetectionOverlayItem[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [recentActivities, setRecentActivities] = useState<ActivityRecord[]>([]);

  // Video source management modal
  const [showSourceModal, setShowSourceModal] = useState<boolean>(false);
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [customUrlError, setCustomUrlError] = useState<string | null>(null);
  const [webcamActive, setWebcamActive] = useState<boolean>(false);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // Model & Processing metrics
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [processingFps, setProcessingFps] = useState<number>(30);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [cvError, setCvError] = useState<string | null>(null);

  // Initialize COCO-SSD Human Detector on Mount
  useEffect(() => {
    let mounted = true;
    visionDetector
      .initModel()
      .then((ready) => {
        if (!mounted) return;
        if (ready) {
          setModelStatus('ready');
          setCvError(null);
        } else {
          setModelStatus('error');
          setCvError('Could not initialize Vision Detector');
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setModelStatus('error');
        setCvError(err?.message || 'Error loading vision model');
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Listen for activities-cleared event
  useEffect(() => {
    const handleClear = () => {
      setRecentActivities([]);
    };
    window.addEventListener('activities-cleared', handleClear);
    return () => window.removeEventListener('activities-cleared', handleClear);
  }, []);

  // Safe play helper preventing unhandled AbortError or media removal rejections
  const safePlay = useCallback((el?: HTMLVideoElement | null) => {
    const target = el || videoRef.current;
    if (!target) return;
    try {
      const promise = target.play();
      if (promise !== undefined) {
        promise
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn('[Player] safePlay deferred:', err?.message || err);
          });
      }
    } catch (e: any) {
      console.warn('[Player] safePlay error:', e?.message || String(e));
    }
  }, []);

  // Helper to stop any active webcam stream
  const stopWebcamStream = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    setWebcamActive(false);
  }, []);

  // Function to initialize webcam stream
  const startWebcam = useCallback(async () => {
    try {
      setCvError(null);
      stopWebcamStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });

      webcamStreamRef.current = stream;
      setWebcamActive(true);

      const videoEl = videoRef.current;
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;

        videoEl
          .play()
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn('[Webcam] Play request deferred:', err?.message || String(err));
          });
      }
    } catch (err: any) {
      console.warn('Webcam access notice:', err?.message || String(err));
      stopWebcamStream();
      setCvError(`Webcam access issue: ${err?.message || 'Permission denied or webcam unavailable'}`);
    }
  }, [stopWebcamStream]);

  // Handle component unmount cleanup ONLY
  useEffect(() => {
    return () => {
      stopWebcamStream();
      const video = videoRef.current;
      if (video) {
        try {
          video.pause();
          video.srcObject = null;
          video.removeAttribute('src');
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [stopWebcamStream]);

  // Handle switching video source when selectedCamera changes
  const activeCameraId = selectedCamera?.id;
  const activeCameraUrl = selectedCamera?.sourceUrl;
  const activeSourceType = selectedCamera?.sourceType;

  useEffect(() => {
    if (!selectedCamera) return;

    // Reset video time tracking ref on camera switch
    lastVideoTimeRef.current = -1;
    setDetections([]);
    setCvError(null);

    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (activeSourceType === 'webcam') {
      startWebcam();
    } else {
      stopWebcamStream();

      const rawSrc = selectedCamera.resolvedUrl || activeCameraUrl || '/assets/classroom.mp4';
      const newSrc = resolveSourceUrl(rawSrc, selectedCamera.username, selectedCamera.password);

      // Check if already playing this exact source to prevent unnecessary reload/pause stutter
      const fullUrl = new URL(newSrc, window.location.href).href;
      if (videoEl.src === fullUrl && !videoEl.paused && videoEl.readyState >= 2 && !videoEl.srcObject) {
        setIsPlaying(true);
        return;
      }

      videoEl.pause();
      videoEl.srcObject = null;
      videoEl.removeAttribute('srcObject');
      videoEl.src = newSrc;
      videoEl.load();

      const attemptAutoPlay = () => {
        if (!videoEl) return;
        videoEl
          .play()
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn('[MainPlayer] Play interrupted/pending:', err?.message || err);
          });
      };

      if (videoEl.readyState >= 2) {
        attemptAutoPlay();
      } else {
        const handleReady = () => {
          attemptAutoPlay();
          videoEl.removeEventListener('canplay', handleReady);
          videoEl.removeEventListener('loadedmetadata', handleReady);
        };
        videoEl.addEventListener('canplay', handleReady);
        videoEl.addEventListener('loadedmetadata', handleReady);
      }
    }
  }, [activeCameraId, activeCameraUrl, activeSourceType, startWebcam, stopWebcamStream, selectedCamera]);

  // Synchronize validated candidates & activities with Server DB
  const syncWithServer = useCallback(
    async (currentDetections: DetectionOverlayItem[], newActs: ActivityRecord[]) => {
      if (!selectedCamera) return;
      try {
        // Explicitly map plain data to ensure zero circular or DOM references in payload
        const cleanDetections = currentDetections.map((d) => ({
          trackerId: d.trackerId,
          pId: d.pId,
          confidence: d.confidence,
          bbox: d.bbox,
          pixelBbox: d.pixelBbox,
          center: d.center,
          score: d.score,
          warningLevel: d.warningLevel,
          observedMotion: d.observedMotion,
          detectedActivities: d.detectedActivities || [],
          isStationary: d.isStationary,
          studentName: d.studentName,
          seatNumber: d.seatNumber,
        }));

        const cleanActivities = newActs.map((a) => ({
          id: a.id,
          pId: a.pId,
          cameraId: a.cameraId,
          cameraName: a.cameraName,
          activityType: a.activityType,
          details: a.details,
          scoreChange: a.scoreChange,
          scoreAfter: a.scoreAfter,
          warningLevel: a.warningLevel,
          timestamp: a.timestamp,
          timeDisplay: a.timeDisplay,
        }));

        const res = await fetch('/api/cv/sync-detections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cameraId: String(selectedCamera.id),
            detections: cleanDetections,
            newActivities: cleanActivities,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.allCandidates) {
            onUpdateCandidates(data.allCandidates);
          }
        }
      } catch (e: any) {
        // Background sync failures are logged quietly without interrupting smooth video UI
        console.warn('[Sync] Background database sync notice:', e?.message || String(e));
      }
    },
    [selectedCamera, onUpdateCandidates]
  );

  // Real-time Smooth Tracking Loop (RequestAnimationFrame)
  useEffect(() => {
    if (!detectionActive || modelStatus !== 'ready') return;

    let isRunning = true;
    let lastFrameTime = performance.now();
    let lastProcessTime = 0;
    let frameCount = 0;
    let fpsAccumulator = 0;

    const frameLoop = async (now: number) => {
      if (!isRunning) return;

      const video = videoRef.current;
      // Throttle detection to ~16 FPS (every 60ms) for smooth, natural motion synchronized with video playback
      if (
        video &&
        !video.ended &&
        video.readyState >= 2 &&
        visionDetector.isReady() &&
        now - lastProcessTime >= 60 &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;
        lastProcessTime = now;
        const startInferTime = performance.now();
        const cameraIdAtStart = selectedCamera?.id;

        try {
          const { detections: frameDetections, newActivities: frameActivities } =
            await visionDetector.processVideoFrameAsync(
              video,
              cameraIdAtStart || 'cam-1',
              video.currentTime || 0
            );

          if (selectedCamera?.id !== cameraIdAtStart) return;

          const endInferTime = performance.now();
          const latency = Math.round(endInferTime - startInferTime);
          setLatencyMs(latency);

          // Update overlays synchronously with video frame
          setDetections(frameDetections);

          // Log new activities immediately
          if (frameActivities.length > 0) {
            frameActivities.forEach((act) => {
              onNewActivity(act);
              setRecentActivities((prev) => [act, ...prev.slice(0, 19)]);
            });
          }

          // Compute FPS
          const delta = (now - lastFrameTime) / 1000;
          lastFrameTime = now;
          if (delta > 0 && delta < 1) {
            const currentFps = 1 / delta;
            fpsAccumulator = fpsAccumulator * 0.9 + currentFps * 0.1;
            frameCount++;
            if (frameCount % 6 === 0) {
              setProcessingFps(Math.round(fpsAccumulator * 10) / 10);
            }
          }

          // Periodic server DB synchronization (every ~500ms or when activities happen)
          const currentTime = Date.now();
          if (
            currentTime - lastSyncTimeRef.current > 500 ||
            frameActivities.length > 0
          ) {
            lastSyncTimeRef.current = currentTime;
            syncWithServer(frameDetections, frameActivities);

            // Update diagnostics
            if (selectedCamera) {
              const allCands = visionDetector.getTrackedCandidates(selectedCamera.id);
              onUpdateCandidates(allCands);
              onUpdateDiagnostics({
                cvWorkerStatus: 'online',
                modelName: 'Multi-Person Silhouette & Contour Tracker',
                tracker: 'Spatial Centroid Association',
                device: 'hardware-accelerated',
                fps: Math.round(fpsAccumulator * 10) / 10 || 16,
                latencyMs: latency,
                activeTracks: frameDetections.length,
                totalCandidates: allCands.length,
                activeWarnings: allCands.filter(
                  (c) => c.warningLevel === 'high' || c.warningLevel === 'warning'
                ).length,
                processedFrames: frameCount,
                lastProcessedTime: new Date().toISOString(),
              });
            }
          }
        } catch (err: any) {
          console.warn('[MainPlayer] Frame loop notice:', err?.message || String(err));
        }
      }

      if (isRunning) {
        animFrameIdRef.current = requestAnimationFrame(frameLoop);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(frameLoop);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [
    detectionActive,
    modelStatus,
    selectedCamera,
    onNewActivity,
    onUpdateCandidates,
    onUpdateDiagnostics,
    syncWithServer,
  ]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      safePlay(video);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error('Fullscreen request failed:', err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && videoRef.current) {
      stopWebcamStream();
      const url = URL.createObjectURL(file);
      if (selectedCamera) {
        visionDetector.resetTracks(selectedCamera.id);
      }
      setDetections([]);
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.load();
      safePlay(videoRef.current);
      setShowSourceModal(false);
    }
  };

  const handleCustomUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrlInput.trim() || !videoRef.current) return;

    const rawInput = customUrlInput.trim();
    const validation: VideoValidationResult = validateVideoUrl(rawInput);

    if (!validation.isValid) {
      setCustomUrlError(
        validation.errorMessage +
          (validation.suggestedAction ? ` ${validation.suggestedAction}` : '')
      );
      return;
    }

    setCustomUrlError(null);
    stopWebcamStream();

    const resolvedUrl = validation.playableUrl;

    if (selectedCamera) {
      visionDetector.resetTracks(selectedCamera.id);
    }
    setDetections([]);

    // Update camera state so all tabs and detection loops consume the resolved stream
    const updatedCam: CameraSource = selectedCamera
      ? {
          ...selectedCamera,
          sourceUrl: rawInput,
          resolvedUrl: resolvedUrl,
          sourceType: validation.sourceType,
          name: validation.providerName
            ? `${validation.providerName} (${selectedCamera.name})`
            : selectedCamera.name,
        }
      : {
          id: `cam-${Date.now()}`,
          name: validation.providerName ? `${validation.providerName} Stream` : 'Custom Stream',
          sourceType: validation.sourceType,
          sourceUrl: rawInput,
          resolvedUrl: resolvedUrl,
          location: 'Custom Stream Source',
          enabled: true,
          status: 'active',
        };

    onSelectCamera(updatedCam);

    videoRef.current.pause();
    videoRef.current.srcObject = null;
    videoRef.current.src = resolvedUrl;
    videoRef.current.load();
    safePlay(videoRef.current);
    setShowSourceModal(false);
  };

  const clearWarningForCandidate = async (pId: string) => {
    if (selectedCamera) {
      visionDetector.clearScore(selectedCamera.id, pId);
    }
    try {
      const res = await fetch(`/api/candidates/${pId}/clear-warning`, { method: 'POST' });
      if (res.ok) {
        setDetections((prev) =>
          prev.map((d) =>
            d.pId === pId ? { ...d, warningLevel: 'normal', score: 0 } : d
          )
        );
        setSelectedCandidateId(null);
      }
    } catch (e: any) {
      console.warn('Failed to clear candidate warning:', e?.message || String(e));
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4 min-w-0">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 p-2.5 rounded-xl border text-xs shadow-sm transition-colors bg-white/90 border-neutral-200 text-neutral-800 dark:bg-neutral-900/60 dark:border-neutral-800 dark:text-neutral-200 w-full min-w-0">
        {/* Camera Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 max-w-full min-w-0 scrollbar-none">
          <span className="text-neutral-500 dark:text-neutral-400 font-medium text-[11px] uppercase tracking-wider pl-1 mr-1 shrink-0">
            Feed:
          </span>
          {cameras.map((cam) => {
            const isSelected = selectedCamera?.id === cam.id;
            return (
              <button
                type="button"
                key={cam.id}
                onClick={() => onSelectCamera(cam)}
                className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                  isSelected
                    ? 'bg-neutral-900 text-white font-semibold shadow-sm dark:bg-neutral-100 dark:text-neutral-950'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 border border-neutral-300 dark:bg-neutral-800/80 dark:text-neutral-300 dark:hover:bg-neutral-700/80 dark:border-neutral-700/50'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="truncate max-w-[120px] sm:max-w-none">{cam.name}</span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                )}
              </button>
            );
          })}

          {/* Change source button */}
          <button
            type="button"
            onClick={() => setShowSourceModal(true)}
            className="cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:border-neutral-700"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Switch Source</span>
          </button>
        </div>

        {/* Real-time Status Badges */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap shrink-0">
          {/* Active Tracks */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-neutral-700 border-neutral-200 bg-neutral-50 dark:bg-neutral-950/80 dark:border-neutral-800 dark:text-neutral-300">
            <UserCheck className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span className="hidden xs:inline">Tracked:</span>
            <span className="font-mono font-semibold text-neutral-900 dark:text-white">{detections.length}</span>
          </div>

          {/* Warnings Count */}
          {detections.filter((d) => d.warningLevel === 'high' || d.warningLevel === 'warning').length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-red-50 border-red-200 text-red-800 dark:bg-red-950/70 dark:border-red-800/60 dark:text-red-200">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
              <span className="hidden xs:inline">Warnings:</span>
              <span className="font-mono font-semibold text-red-900 dark:text-red-100">
                {detections.filter((d) => d.warningLevel === 'high' || d.warningLevel === 'warning').length}
              </span>
            </div>
          )}

          {/* Latency / FPS */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
            <span>{latencyMs}ms</span>
            <span>•</span>
            <span>{processingFps.toFixed(1)} FPS</span>
          </div>
        </div>
      </div>

      {/* Main Video Stage & Overlay Container with Grid & min-w-0 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 w-full min-w-0">
        <div className="lg:col-span-3 min-w-0 space-y-3">
          <div
            ref={containerRef}
            className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-neutral-200 dark:border-neutral-800 select-none group"
          >
            {/* The Real Video Element */}
            <video
              ref={videoRef}
              src={
                selectedCamera?.sourceType === 'webcam'
                  ? undefined
                  : resolveSourceUrl(
                      selectedCamera?.resolvedUrl || selectedCamera?.sourceUrl || '/assets/classroom.mp4',
                      selectedCamera?.username,
                      selectedCamera?.password
                    )
              }
              autoPlay
              playsInline
              muted
              loop
              crossOrigin="anonymous"
              className="w-full h-full object-contain bg-black"
              onLoadedMetadata={() => {
                const el = videoRef.current;
                if (el) {
                  el.play().then(() => setIsPlaying(true)).catch(() => {});
                }
              }}
              onCanPlay={() => {
                const el = videoRef.current;
                if (el && el.paused) {
                  el.play().then(() => setIsPlaying(true)).catch(() => {});
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => {
                if (videoRef.current && videoRef.current.paused) {
                  setIsPlaying(false);
                }
              }}
              onError={(e) => {
                const target = e.currentTarget as HTMLVideoElement | null;
                const mediaError = target?.error;
                const errMsg = mediaError
                  ? `Code ${mediaError.code}: ${mediaError.message || 'Media decode or network error'}`
                  : 'Video resource could not be loaded';
                console.warn('[VideoElement] Media loading warning:', errMsg);
                if (selectedCamera?.sourceType === 'webcam') {
                  setCvError('Unable to access webcam stream. Please verify camera permissions.');
                } else {
                  setCvError(`Unable to load video feed from ${selectedCamera?.name || 'source'}`);
                }
              }}
            />

            {/* ERROR NOTICE if Detector encounters issues */}
            {cvError && (
              <div className="absolute top-4 left-4 right-4 z-40 bg-red-950/90 border border-red-700/80 text-red-200 px-4 py-2.5 rounded-xl backdrop-blur-md flex items-center justify-between text-xs shadow-lg animate-fade-in">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    <strong>Detector Alert:</strong> {cvError}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCvError(null)}
                  className="cursor-pointer text-red-300 hover:text-white text-xs px-2 py-0.5 rounded bg-red-900/60"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* REAL-TIME BODY-FITTED BOUNDING BOXES & CHEST NAMEPLATES */}
            <div className="absolute inset-0 pointer-events-none z-20">
              {detections.map((det, detIdx) => {
                const [x1, y1, x2, y2] = det.bbox;
                const leftPercent = `${x1 * 100}%`;
                const topPercent = `${y1 * 100}%`;
                const widthPercent = `${(x2 - x1) * 100}%`;
                const heightPercent = `${(y2 - y1) * 100}%`;

                const isWarning = det.warningLevel === 'warning';
                const isHighWarning = det.warningLevel === 'high';

                // Warning badge styling
                let nameplateClasses = 'bg-neutral-900/90 text-neutral-100 border-neutral-700/80 shadow-sm';
                let boxClasses = 'border-white/50 bg-white/[0.04]';

                if (isHighWarning) {
                  nameplateClasses =
                    'bg-red-950/95 text-red-100 border-red-500 shadow-md shadow-red-950/80 ring-1 ring-red-500/50';
                  boxClasses = 'border-red-500/90 bg-red-500/10 ring-1 ring-red-500/40';
                } else if (isWarning) {
                  nameplateClasses =
                    'bg-amber-950/90 text-amber-100 border-amber-500/80 shadow-md shadow-amber-950/60';
                  boxClasses = 'border-amber-400/85 bg-amber-500/10';
                }

                let chestTopPercent = 25;
                const hasNearbyUpperNeighbor = detections.some(
                  (other, otherIdx) =>
                    otherIdx !== detIdx &&
                    Math.abs(other.bbox[0] - det.bbox[0]) < 0.12 &&
                    other.bbox[1] < det.bbox[1] &&
                    det.bbox[1] - other.bbox[1] < 0.22
                );
                if (hasNearbyUpperNeighbor) {
                  chestTopPercent = 32;
                }

                return (
                  <div
                    key={`${det.trackerId}-${det.pId}`}
                    style={{
                      left: leftPercent,
                      top: topPercent,
                      width: widthPercent,
                      height: heightPercent,
                      willChange: 'left, top, width, height',
                    }}
                    className="absolute pointer-events-none"
                  >
                    {showBoundingBoxes && (
                      <div
                        className={`w-full h-full rounded border ${boxClasses} transition-colors duration-150`}
                      />
                    )}

                    {showNameplates && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCandidateId(det.pId);
                        }}
                        style={{
                          top: `${chestTopPercent}%`,
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                        }}
                        className={`absolute pointer-events-auto cursor-pointer inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10.5px] font-mono font-medium tracking-tight border backdrop-blur-md transition-transform hover:scale-105 select-none whitespace-nowrap z-10 ${nameplateClasses}`}
                        title={`Candidate ${det.pId} | Score: ${det.score}/100`}
                      >
                        <span className="font-semibold text-neutral-100">{det.pId}</span>
                        <span
                          className={`font-bold ml-0.5 ${
                            isHighWarning
                              ? 'text-red-200'
                              : isWarning
                              ? 'text-amber-200'
                              : 'text-neutral-300'
                          }`}
                        >
                          {det.score}
                        </span>

                        {isHighWarning && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Minimal Controls Bar */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 sm:p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30 flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="cursor-pointer w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <div className="text-xs font-mono text-neutral-300 truncate max-w-[120px] sm:max-w-xs">
                  <span>{selectedCamera?.name}</span>
                </div>
              </div>

              {/* Overlay display toggles */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setShowNameplates(!showNameplates)}
                  className={`cursor-pointer px-2 sm:px-2.5 py-1 rounded-md text-xs font-medium backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    showNameplates
                      ? 'bg-neutral-200 text-neutral-950 font-semibold'
                      : 'bg-black/50 text-neutral-400 hover:text-white'
                  }`}
                >
                  Nameplates
                </button>

                <button
                  type="button"
                  onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                  className={`cursor-pointer px-2 sm:px-2.5 py-1 rounded-md text-xs font-medium backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    showBoundingBoxes
                      ? 'bg-neutral-200 text-neutral-950 font-semibold'
                      : 'bg-black/50 text-neutral-400 hover:text-white'
                  }`}
                >
                  Boxes
                </button>

                <button
                  type="button"
                  onClick={() => setDetectionActive(!detectionActive)}
                  className={`cursor-pointer flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-medium backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    detectionActive
                      ? 'bg-emerald-500 text-white font-semibold'
                      : 'bg-amber-600/80 text-neutral-200'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span>{detectionActive ? 'CV Active' : 'Paused'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="cursor-pointer w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Candidate Popover Card when Nameplate is clicked */}
          {selectedCandidateId && (
            <div className="p-4 rounded-xl border shadow-lg flex flex-wrap items-center justify-between gap-4 animate-fade-in bg-white border-neutral-200 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-base bg-neutral-100 border border-neutral-300 text-neutral-800 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white">
                  {selectedCandidateId}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    Candidate {selectedCandidateId}
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Active in live CCTV frame • Score:{' '}
                    <strong className="text-neutral-900 dark:text-white">
                      {detections.find((d) => d.pId === selectedCandidateId)?.score || 0}/100
                    </strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => clearWarningForCandidate(selectedCandidateId)}
                  className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 bg-neutral-100 text-neutral-800 hover:bg-neutral-200 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:border-neutral-700"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Clear Warning</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCandidateId(null)}
                  className="cursor-pointer px-2.5 py-1.5 rounded-lg text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Real-time Side Activity Stream (Fixed min-w-0 & break-words to permanently prevent horizontal scroll overflow) */}
        <div className="space-y-3 min-w-0">
          <div className="rounded-xl p-3 flex flex-col h-full min-w-0 border shadow-sm transition-colors bg-white/90 border-neutral-200 text-neutral-900 dark:bg-neutral-900/70 dark:border-neutral-800 dark:text-neutral-100">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-200 dark:border-neutral-800 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Activity className="w-4 h-4 text-emerald-500 shrink-0" />
                <h3 className="text-xs font-semibold uppercase tracking-wider truncate text-neutral-800 dark:text-neutral-200">
                  Live Activity Stream
                </h3>
              </div>
              <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 shrink-0">
                {recentActivities.length} events
              </span>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[380px] pr-1 min-w-0">
              {recentActivities.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 text-xs">
                  <Activity className="w-6 h-6 mx-auto mb-2 opacity-40 animate-pulse text-emerald-500" />
                  <span>Monitoring feed for observable candidate movements...</span>
                </div>
              ) : (
                recentActivities.map((act) => {
                  const isHigh = act.warningLevel === 'high';
                  const isWarn = act.warningLevel === 'warning';

                  return (
                    <div
                      key={act.id}
                      className={`p-2.5 rounded-lg border text-xs transition-all min-w-0 ${
                        isHigh
                          ? 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-800/60 dark:text-red-200'
                          : isWarn
                          ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800/50 dark:text-amber-200'
                          : 'bg-neutral-50 border-neutral-200 text-neutral-800 dark:bg-neutral-800/50 dark:border-neutral-700/40 dark:text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
                        <span className="font-mono font-bold text-[11px] truncate shrink min-w-0 text-neutral-900 dark:text-white">
                          {act.pId}
                        </span>
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono shrink-0 whitespace-nowrap">
                          {act.timeDisplay}
                        </span>
                      </div>
                      <p className="text-[11.5px] font-medium leading-snug break-words">
                        {act.activityType}
                      </p>
                      <div className="flex items-center justify-between mt-1.5 text-[10.5px] gap-2 min-w-0">
                        <span className="text-neutral-500 dark:text-neutral-400 shrink-0">
                          Score +{act.scoreChange}
                        </span>
                        <span className="font-mono font-semibold shrink-0">
                          Total: {act.scoreAfter}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Switch Source / Video Modal */}
      {showSourceModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border transition-colors bg-white border-neutral-200 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Select Camera Source</h3>
              <button
                type="button"
                onClick={() => setShowSourceModal(false)}
                className="cursor-pointer text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Upload Video File */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Upload Custom Video (MP4 / WebM)
              </label>
              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/50">
                <Upload className="w-8 h-8 text-neutral-400 mb-2" />
                <span className="text-xs text-neutral-700 dark:text-neutral-300 font-medium">
                  Click or drag video file here
                </span>
                <span className="text-[11px] text-neutral-500 mt-0.5">MP4, WebM up to 500MB</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Custom URL / Cloud Share Link */}
            <form onSubmit={handleCustomUrlSubmit} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Stream from Cloud Link or Video URL
                </label>
                <span className="text-[10.5px] font-mono text-neutral-500 dark:text-neutral-400">
                  Google Drive • Dropbox • OneDrive • Box
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://drive.google.com/file/d/.../view or direct .mp4"
                  value={customUrlInput}
                  onChange={(e) => {
                    setCustomUrlInput(e.target.value);
                    if (customUrlError) setCustomUrlError(null);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 bg-neutral-100 border text-neutral-900 dark:bg-neutral-950 dark:text-white ${
                    customUrlError
                      ? 'border-rose-500 focus:ring-rose-400 dark:border-rose-500'
                      : 'border-neutral-300 focus:ring-neutral-400 dark:border-neutral-700'
                  }`}
                />
                <button
                  type="submit"
                  className="cursor-pointer px-4 py-2 rounded-lg text-xs font-semibold transition-colors bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white shrink-0"
                >
                  Load Stream
                </button>
              </div>

              {/* Validation Error Message */}
              {customUrlError && (
                <div className="p-2.5 rounded-lg border text-xs space-y-1 bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/60 dark:border-rose-800/80 dark:text-rose-200 animate-in fade-in flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">{customUrlError}</p>
                </div>
              )}

              {/* Real-time Cloud Link Conversion Detection Feedback */}
              {!customUrlError && customUrlInput.trim() && (() => {
                const validation = validateVideoUrl(customUrlInput.trim());
                if (validation.isValid && validation.sourceType === 'cloud_link') {
                  return (
                    <div className="p-2.5 rounded-lg border text-xs space-y-1 bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800/80 dark:text-emerald-200 animate-in fade-in">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{validation.providerName || 'Cloud Stream'} Detected</span>
                      </div>
                      <p className="text-[11px] font-mono break-all opacity-90 pl-5">
                        Stream Proxy: {validation.playableUrl}
                      </p>
                      <p className="text-[10.5px] opacity-75 pl-5">
                        Auto-converted to range-compatible video stream. Virus warning bypass & CORS enabled.
                      </p>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex items-center justify-between text-[11px] pt-0.5">
                <span className="text-neutral-500 dark:text-neutral-400">Sample link:</span>
                <button
                  type="button"
                  onClick={() => setCustomUrlInput('https://drive.google.com/file/d/1_rU3wGEHvWmfnSDHmKnLnbN9HfQHOkeA/view')}
                  className="cursor-pointer font-mono text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline"
                >
                  + Use Google Drive Sample Link
                </button>
              </div>
            </form>

            {/* Webcam Ingest */}
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  startWebcam();
                  setShowSourceModal(false);
                }}
                className="cursor-pointer w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium border transition-colors bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-white dark:border-neutral-700"
              >
                <Video className="w-4 h-4 text-emerald-500" />
                <span>Use Device Webcam / Live Ingest</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
