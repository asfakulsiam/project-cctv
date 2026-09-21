/**
 * Apple Human Interface Guidelines Active Camera Details Panel
 * Real-time camera optical details, tracked subjects list, and coverage metrics.
 */

import React from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { 
  Camera, 
  Eye, 
  MapPin, 
  CheckCircle,
  Activity,
  ChevronRight
} from 'lucide-react';
import { Card } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';

interface ActiveCameraDetailsPanelProps {
  onInspectStudent?: (studentId: string) => void;
}

export function ActiveCameraDetailsPanel({ onInspectStudent }: ActiveCameraDetailsPanelProps) {
  const { 
    cameras, 
    focusedCameraId, 
    primaryCameraId, 
    tracksByCamera, 
    students,
    seats 
  } = useMonitoring();

  const activeCamera = cameras.find(c => c.camera_id === focusedCameraId) || cameras[0];
  const tracks = tracksByCamera[focusedCameraId] || [];
  const isPrimary = activeCamera?.camera_id === primaryCameraId;

  if (!activeCamera) {
    return (
      <Card padding="lg" className="text-center space-y-2">
        <Camera className="w-6 h-6 mx-auto text-[var(--system-text-tertiary)]" />
        <h4 className="font-semibold text-[14px] text-[var(--system-text-primary)]">No Active Perspective</h4>
        <p className="text-[12px] text-[var(--system-text-secondary)] max-w-xs mx-auto">
          Surveillance streams have not been configured yet. Feeds will appear once streams are online.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="md" className="space-y-4">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--system-separator)]">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-[10px] bg-[var(--system-accent-subtle)] flex items-center justify-center text-[var(--system-accent)]">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--system-text-primary)] tracking-tight">
              {activeCamera.name}
            </h3>
            <span className="text-[11px] text-[var(--system-text-tertiary)] font-mono-apple">
              {isPrimary ? 'Primary Perspective' : 'Secondary Optical Angle'}
            </span>
          </div>
        </div>

        <Badge variant="success" dot>
          ONLINE
        </Badge>
      </div>

      {/* Optical Specs */}
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="p-2.5 rounded-[12px] bg-[var(--system-fill)] border border-[var(--system-chrome-border)]">
          <span className="text-[var(--system-text-tertiary)] block text-[10px] font-medium">STREAM RESOLUTION</span>
          <span className="font-mono-apple font-semibold text-[var(--system-text-primary)]">
            {activeCamera.resolution?.width || 1920}x{activeCamera.resolution?.height || 1080}
          </span>
        </div>
        <div className="p-2.5 rounded-[12px] bg-[var(--system-fill)] border border-[var(--system-chrome-border)]">
          <span className="text-[var(--system-text-tertiary)] block text-[10px] font-medium">CLARITY INDEX</span>
          <span className="font-mono-apple font-semibold text-[var(--system-accent)]">
            {activeCamera.quality_score || 95}%
          </span>
        </div>
      </div>

      {/* Perspective Description */}
      <div className="p-2.5 rounded-[12px] bg-[var(--system-fill)] border border-[var(--system-chrome-border)]">
        <span className="text-[var(--system-text-tertiary)] block text-[10px] font-medium mb-0.5">COVERAGE ANGLE</span>
        <span className="text-[12px] text-[var(--system-text-secondary)]">
          {activeCamera.view_angle_description || 'Surveillance Perspective'}
        </span>
      </div>

      {/* Tracked Subjects in this Feed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[var(--system-text-primary)]">
            Tracked Candidates ({tracks.length})
          </span>
          <span className="text-[11px] font-mono-apple text-[var(--system-accent)]">
            Active CV Bounding
          </span>
        </div>

        {tracks.length === 0 ? (
          <div className="p-4 rounded-[12px] bg-[var(--system-fill)] text-center text-[12px] text-[var(--system-text-tertiary)]">
            No subjects currently in active view frame.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
            {tracks.map(t => {
              const matchedStudent = students.find(s => s.id === t.associated_student_id);

              return (
                <div
                  key={t.track_id}
                  className="flex items-center justify-between p-2 rounded-[10px] bg-[var(--system-fill)] border border-[var(--system-chrome-border)] hover:bg-[var(--system-fill-secondary)] transition-colors text-[12px]"
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--system-accent)]" />
                    <div>
                      <span className="font-semibold text-[var(--system-text-primary)] font-mono-apple">
                        {matchedStudent ? matchedStudent.student_id_number : t.track_id}
                      </span>
                      <span className="text-[10px] font-mono-apple text-[var(--system-text-tertiary)] block">
                        Track: {t.track_id} • Score: {t.suspicion_score}
                      </span>
                    </div>
                  </div>

                  {matchedStudent && onInspectStudent && (
                    <button
                      onClick={() => onInspectStudent(matchedStudent.id)}
                      className="px-2 py-1 rounded-[6px] bg-[var(--system-accent-subtle)] text-[var(--system-accent)] text-[11px] font-medium hover:opacity-80 transition-opacity flex items-center space-x-0.5 cursor-pointer"
                    >
                      <span>Inspect</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </Card>
  );
}
