/**
 * Screen Wake Lock & Media Session API Hook
 * 
 * Guarantees screen does not sleep during active surveillance playback:
 * 1. Uses Screen Wake Lock API (navigator.wakeLock.request('screen')).
 * 2. Automatically re-acquires lock upon visibilitychange when tab regains focus.
 * 3. Fallback for iOS Safari / older mobile engines: invisible looping muted video track.
 * 4. Full Media Session API integration for lock-screen controls and status metadata.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseScreenWakeLockOptions {
  isPlaying: boolean;
  title?: string;
  subtitle?: string;
  onPlay?: () => void;
  onPause?: () => void;
}

export function useScreenWakeLock({
  isPlaying,
  title = 'Live Examination Surveillance',
  subtitle = 'Multi-Camera Computer Vision Proctoring',
  onPlay,
  onPause
}: UseScreenWakeLockOptions) {
  const [isLocked, setIsLocked] = useState(false);
  const wakeLockRef = useRef<any>(null);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);

  // 1. Request Native Wake Lock
  const requestWakeLock = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if ('wakeLock' in navigator) {
      try {
        if (!wakeLockRef.current || wakeLockRef.current.released) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          setIsLocked(true);
          
          wakeLockRef.current.addEventListener('release', () => {
            setIsLocked(false);
          });
        }
      } catch (err: any) {
        // May fail if battery saver is engaged or tab is backgrounded
        console.debug('[WakeLock] Request notice:', err?.message || err);
      }
    } else {
      // Fallback for iOS Safari without navigator.wakeLock:
      // Loop a tiny 1x1 muted video element
      activateVideoFallback();
    }
  }, []);

  // 2. Release Native Wake Lock
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
    }
    setIsLocked(false);
    deactivateVideoFallback();
  }, []);

  // iOS Safari Fallback Video Setup
  const activateVideoFallback = () => {
    if (typeof document === 'undefined') return;
    if (!fallbackVideoRef.current) {
      const vid = document.createElement('video');
      vid.setAttribute('playsinline', '');
      vid.setAttribute('muted', '');
      vid.muted = true;
      vid.loop = true;
      vid.style.position = 'fixed';
      vid.style.top = '-9999px';
      vid.style.left = '-9999px';
      vid.style.width = '1px';
      vid.style.height = '1px';
      vid.style.opacity = '0.01';
      vid.style.pointerEvents = 'none';
      // Ultra-lightweight 1-frame blank WebM/MP4 data URI
      vid.src = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAAAAGlzb21tcDQxAAAACHNmcmVlAAAAF21kYXRl4AAAAAAAAAAAAAAAAB8AAABtZGF0';
      document.body.appendChild(vid);
      fallbackVideoRef.current = vid;
    }

    fallbackVideoRef.current.play().then(() => {
      setIsLocked(true);
    }).catch(() => {
      // Autoplay restriction fallback
    });
  };

  const deactivateVideoFallback = () => {
    if (fallbackVideoRef.current) {
      fallbackVideoRef.current.pause();
      if (fallbackVideoRef.current.parentNode) {
        fallbackVideoRef.current.parentNode.removeChild(fallbackVideoRef.current);
      }
      fallbackVideoRef.current = null;
    }
  };

  // Main lifecycle: sync with isPlaying
  useEffect(() => {
    if (isPlaying) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [isPlaying, requestWakeLock, releaseWakeLock]);

  // Re-acquire lock on visibility change (locks auto-release when user switches tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying, requestWakeLock]);

  // 3. Media Session API Integration
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: subtitle,
        album: 'Smart Classroom Exam Monitoring System',
        artwork: [
          { src: '/favicon.ico', sizes: '64x64', type: 'image/x-icon' }
        ]
      });

      if (onPlay) {
        navigator.mediaSession.setActionHandler('play', () => {
          onPlay();
        });
      }
      if (onPause) {
        navigator.mediaSession.setActionHandler('pause', () => {
          onPause();
        });
      }

      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      // ignore mediaSession errors
    }

    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
        } catch {}
      }
    };
  }, [isPlaying, title, subtitle, onPlay, onPause]);

  return { isLocked };
}
