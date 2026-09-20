/**
 * Apple Human Interface Guidelines Camera Switcher Control
 * Single-feed architecture: interactive Cupertino buttons to switch live perspective.
 */

import React from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { Video, Star, Eye } from 'lucide-react';
import { Card } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';

export function CameraButtonsBar() {
  const { 
    cameras, 
    focusedCameraId, 
    setFocusedCameraId, 
    primaryCameraId,
    tracksByCamera 
  } = useMonitoring();

  if (cameras.length === 0) {
    return (
      <Card padding="md" className="text-center">
        <Video className="w-5 h-5 mx-auto mb-1 text-[var(--system-text-tertiary)]" />
        <span className="text-[13px] font-semibold text-[var(--system-text-primary)]">
          No Surveillance Feeds Registered
        </span>
        <p className="text-[12px] text-[var(--system-text-secondary)] mt-0.5">
          Surveillance camera feeds will appear here once configured.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="sm" className="space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-1">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-[6px] bg-[var(--system-accent-subtle)] flex items-center justify-center text-[var(--system-accent)]">
            <Video className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--system-text-primary)] tracking-tight">
              Camera Perspectives ({cameras.length})
            </h3>
            <p className="text-[11px] text-[var(--system-text-secondary)]">
              Single-camera active display. Tap any angle to switch live perspective.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-[11px] font-mono-apple text-[var(--system-text-tertiary)]">
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--system-success)]" />
            <span>All Streams Ingesting</span>
          </span>
        </div>
      </div>

      {/* Camera Selection Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {cameras.map(cam => {
          const isActive = cam.camera_id === focusedCameraId;
          const isPrimary = cam.camera_id === primaryCameraId;
          const trackCount = tracksByCamera[cam.camera_id]?.length || 0;
          const isOnline = cam.status === 'online' && cam.enabled !== false;

          return (
            <button
              key={cam.camera_id}
              onClick={() => setFocusedCameraId(cam.camera_id)}
              className={`flex items-center justify-between p-2.5 rounded-[12px] border transition-all duration-200 cursor-pointer min-h-[48px] select-none text-left ${
                isActive
                  ? 'bg-[var(--system-accent)] text-white border-[var(--system-accent)] shadow-sm'
                  : 'bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] text-[var(--system-text-primary)] border-[var(--system-chrome-border)]'
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isOnline
                    ? isActive ? 'bg-white animate-pulse' : 'bg-[var(--system-success)]'
                    : 'bg-[var(--system-destructive)]'
                }`} />

                <div className="min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[13px] font-semibold truncate">
                      {cam.name}
                    </span>
                    {isPrimary && (
                      <Star className={`w-3 h-3 ${isActive ? 'text-amber-200 fill-amber-200' : 'text-amber-500 fill-amber-500'}`} />
                    )}
                  </div>
                  <div className={`text-[11px] truncate ${isActive ? 'text-white/80' : 'text-[var(--system-text-tertiary)]'}`}>
                    {cam.view_angle_description || cam.camera_id}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 flex-shrink-0">
                <span className={`text-[11px] font-mono-apple font-semibold px-2 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--system-secondary-bg)] text-[var(--system-text-secondary)] border border-[var(--system-card-border)]'
                }`}>
                  {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
                </span>
                {isActive && <Eye className="w-3.5 h-3.5 text-white ml-0.5" />}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
