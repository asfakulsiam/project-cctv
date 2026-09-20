/**
 * Apple Human Interface Guidelines Live Statistics Bar
 * Real-time telemetry counters rendered in Cupertino style cards with
 * high contrast typography and subtle semantic indicators.
 */

import React from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { 
  Users, 
  Video, 
  Activity, 
  ShieldAlert, 
  Cpu,
  UserCheck
} from 'lucide-react';
import { Card } from '../ui/Card.js';

export function LiveStatisticsBar() {
  const { stats, cameras, students } = useMonitoring();

  const flaggedStudents = students.filter(s => s.unified_suspicion_score >= 60).length;
  const warningStudents = students.filter(s => s.unified_suspicion_score >= 35 && s.unified_suspicion_score < 60).length;

  const statItems = [
    {
      label: 'Cameras Online',
      value: stats.online_cameras,
      subvalue: `/ ${stats.total_cameras} feeds`,
      icon: Video,
      accentColor: 'text-[var(--system-accent)]',
      progress: (stats.online_cameras / Math.max(1, stats.total_cameras)) * 100
    },
    {
      label: 'Detected Tracks',
      value: stats.detected_persons,
      subvalue: 'active visual subjects',
      icon: Users,
      accentColor: 'text-[var(--system-info)]'
    },
    {
      label: 'Verified Students',
      value: stats.present_students,
      subvalue: `/ ${students.length} enrolled`,
      icon: UserCheck,
      accentColor: 'text-[var(--system-success)]'
    },
    {
      label: 'Active Movement',
      value: stats.students_moving,
      subvalue: 'real-time motion events',
      icon: Activity,
      accentColor: 'text-[var(--system-warning)]'
    },
    {
      label: 'Suspicion Flags',
      value: flaggedStudents,
      subvalue: `${warningStudents} elevated`,
      icon: ShieldAlert,
      accentColor: flaggedStudents > 0 ? 'text-[var(--system-destructive)]' : 'text-[var(--system-text-tertiary)]',
      isWarning: flaggedStudents > 0
    },
    {
      label: 'CV Engine Core',
      value: `${stats.processing_fps || 24} FPS`,
      subvalue: `${(1000 / (stats.processing_fps || 24)).toFixed(0)}ms cycle`,
      icon: Cpu,
      accentColor: 'text-[var(--system-accent)]'
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {statItems.map((item, idx) => {
        const Icon = item.icon;

        return (
          <Card key={idx} padding="sm" className="flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--system-text-secondary)] tracking-tight truncate">
                {item.label}
              </span>
              <Icon className={`w-3.5 h-3.5 ${item.accentColor} flex-shrink-0`} />
            </div>

            <div className="my-1">
              <div className="flex items-baseline space-x-1.5">
                <span className={`text-[20px] font-semibold font-mono-apple tracking-tight ${
                  item.isWarning ? 'text-[var(--system-destructive)]' : 'text-[var(--system-text-primary)]'
                }`}>
                  {item.value}
                </span>
              </div>
              <span className="text-[11px] text-[var(--system-text-tertiary)] block truncate">
                {item.subvalue}
              </span>
            </div>

            {item.progress !== undefined && (
              <div className="w-full bg-[var(--system-fill)] h-1 rounded-full overflow-hidden mt-1">
                <div 
                  className="bg-[var(--system-accent)] h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
