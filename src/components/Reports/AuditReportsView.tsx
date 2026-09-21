/**
 * Apple Human Interface Guidelines Academic Audit Reports & Incident Export View
 * Pristine tables, KPI cards, download actions, and student breakdown.
 */

import React, { useEffect, useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Users,
  ShieldAlert
} from 'lucide-react';
import { Card } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';

export function AuditReportsView() {
  const { session, students, cameras, events, settings } = useMonitoring();
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const highThreshold = settings?.thresholds?.high_suspicion_threshold ?? 65;
  const warningThreshold = settings?.thresholds?.warning_suspicion_threshold ?? 40;

  useEffect(() => {
    fetch('/api/reports/session')
      .then(res => res.json())
      .then(data => {
        setReportData(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load report summary:', err);
        setIsLoading(false);
      });
  }, []);

  const handleExportCSV = () => {
    window.location.href = '/api/reports/export/csv';
  };

  const handleExportJSON = () => {
    if (!reportData) return;
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `academic_exam_report_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const highRisk = students.filter(s => (s.cumulative_score ?? s.unified_suspicion_score) >= highThreshold);
  const warnings = students.filter(s => {
    const score = s.cumulative_score ?? s.unified_suspicion_score;
    return score >= warningThreshold && score < highThreshold;
  });

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <Card padding="md" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Badge variant="accent">
              OFFICIAL AUDIT RECORD
            </Badge>
            <span className="text-[12px] text-[var(--system-text-tertiary)] font-mono-apple">
              Session #{session?.id || session?.course_code || 'SURVEILLANCE'}
            </span>
          </div>
          <h1 className="text-[22px] font-semibold text-[var(--system-text-primary)] tracking-tight mt-1.5">
            Exam Behavioral Audit &amp; Incident Summary
          </h1>
          <p className="text-[13px] text-[var(--system-text-secondary)] mt-0.5">
            {session ? `${session.title} • ${session.course_code}` : 'Live examination surveillance record'}
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center space-x-2.5">
          <Button
            variant="primary"
            onClick={handleExportCSV}
            icon={Download}
          >
            Export CSV
          </Button>

          <Button
            variant="secondary"
            onClick={handleExportJSON}
            icon={FileText}
          >
            Export JSON
          </Button>
        </div>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card padding="sm">
          <span className="text-[11px] text-[var(--system-text-secondary)] uppercase font-medium">Present Candidates</span>
          <div className="text-[22px] font-bold font-mono-apple text-[var(--system-text-primary)] mt-1">
            {students.filter(s => s.status === 'present' || s.status === 'flagged').length}
          </div>
          <span className="text-[11px] text-[var(--system-text-tertiary)] font-mono-apple mt-0.5 block">
            {students.length} Registered
          </span>
        </Card>

        <Card padding="sm">
          <span className="text-[11px] text-[var(--system-text-secondary)] uppercase font-medium">Critical Threshold</span>
          <div className="text-[22px] font-bold font-mono-apple text-[var(--system-destructive)] mt-1">
            {highRisk.length}
          </div>
          <span className="text-[11px] text-[var(--system-destructive)] font-mono-apple mt-0.5 block opacity-80">
            Score &ge; {highThreshold} pts
          </span>
        </Card>

        <Card padding="sm">
          <span className="text-[11px] text-[var(--system-text-secondary)] uppercase font-medium">Warning Threshold</span>
          <div className="text-[22px] font-bold font-mono-apple text-[var(--system-warning)] mt-1">
            {warnings.length}
          </div>
          <span className="text-[11px] text-[var(--system-warning)] font-mono-apple mt-0.5 block opacity-80">
            Score {warningThreshold} - {highThreshold - 1} pts
          </span>
        </Card>

        <Card padding="sm">
          <span className="text-[11px] text-[var(--system-text-secondary)] uppercase font-medium">Logged CV Incidents</span>
          <div className="text-[22px] font-bold font-mono-apple text-[var(--system-accent)] mt-1">
            {events.length}
          </div>
          <span className="text-[11px] text-[var(--system-text-tertiary)] font-mono-apple mt-0.5 block">
            Across {cameras.length} cameras
          </span>
        </Card>
      </div>

      {/* Student Audit Roster */}
      <Card padding="none" className="overflow-hidden">
        <div className="p-4 bg-[var(--system-chrome-bg)] backdrop-blur-md border-b border-[var(--system-chrome-border)] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[var(--system-text-primary)]">
            Candidate Incident Breakdown &amp; Dual Scoring Audit
          </h2>
          <span className="text-[11px] text-[var(--system-text-tertiary)] font-mono-apple">
            Current / Cumulative / Peak Risk
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-[var(--system-fill)] text-[var(--system-text-secondary)] border-b border-[var(--system-separator)] font-mono-apple text-[11px]">
              <tr>
                <th className="px-4 py-3 font-medium">Candidate</th>
                <th className="px-4 py-3 font-medium">ID Number</th>
                <th className="px-4 py-3 font-medium">Desk</th>
                <th className="px-4 py-3 font-medium">Attendance</th>
                <th className="px-4 py-3 font-medium">Current Risk</th>
                <th className="px-4 py-3 font-medium">Cumulative Audit</th>
                <th className="px-4 py-3 font-medium">Peak Score</th>
                <th className="px-4 py-3 font-medium">Camera Angles</th>
                <th className="px-4 py-3 font-medium">Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--system-separator)] text-[var(--system-text-secondary)]">
              {students.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[var(--system-text-tertiary)]">
                    No candidates registered or present in this examination session.
                  </td>
                </tr>
              )}
              {students.map(s => {
                const currentScore = s.current_score ?? 0;
                const cumulativeScore = s.cumulative_score ?? s.unified_suspicion_score ?? 0;
                const peakScore = s.max_score ?? Math.max(currentScore, cumulativeScore);

                const isHigh = cumulativeScore >= highThreshold;
                const isWarn = cumulativeScore >= warningThreshold && !isHigh;

                return (
                  <tr key={s.id} className="hover:bg-[var(--system-fill-secondary)] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[var(--system-text-primary)]">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 font-mono-apple text-[var(--system-text-secondary)]">
                      {s.student_id_number}
                    </td>
                    <td className="px-4 py-3 font-mono-apple text-[var(--system-accent)]">
                      {s.seat_id ? s.seat_id.toUpperCase() : 'Unassigned'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.status === 'flagged' ? 'destructive' : s.status === 'present' ? 'success' : 'secondary'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono-apple">
                      <span className={currentScore >= warningThreshold ? 'text-[var(--system-warning)] font-bold' : 'text-[var(--system-text-tertiary)]'}>
                        {currentScore}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono-apple font-semibold">
                      <span className={isHigh ? 'text-[var(--system-destructive)] font-bold' : isWarn ? 'text-[var(--system-warning)] font-bold' : 'text-[var(--system-text-primary)]'}>
                        {cumulativeScore} pts
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono-apple text-amber-400">
                      {peakScore}
                    </td>
                    <td className="px-4 py-3">
                      {s.active_observations && s.active_observations.length > 0 ? (
                        <span className="font-mono-apple text-[11px] text-[var(--system-accent)]">
                          {s.active_observations.map(o => o.camera_id).join(', ')}
                        </span>
                      ) : (
                        <span className="text-[var(--system-text-quaternary)]">No active angle</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isHigh ? (
                        <span className="text-[var(--system-destructive)] font-semibold flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Flagged for Review</span>
                        </span>
                      ) : isWarn ? (
                        <span className="text-[var(--system-warning)] flex items-center space-x-1">
                          <span>Minor Anomalies</span>
                        </span>
                      ) : (
                        <span className="text-[var(--system-success)] flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Normal</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Incident Log Sample */}
      <Card padding="none" className="overflow-hidden">
        <div className="p-4 bg-[var(--system-chrome-bg)] backdrop-blur-md border-b border-[var(--system-chrome-border)] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[var(--system-text-primary)]">
            Recorded Examination Incident Log
          </h2>
          <span className="text-[11px] text-[var(--system-text-tertiary)] font-mono-apple">
            Audit Stream ({events.length} events)
          </span>
        </div>

        <div className="divide-y divide-[var(--system-separator)] text-[12px]">
          {events.length === 0 && (
            <div className="p-6 text-center text-[var(--system-text-tertiary)]">
              No behavioral incidents or system warnings logged for this session.
            </div>
          )}
          {events.slice(0, 20).map((e, idx) => (
            <div key={`${e.id}-${idx}`} className="p-3 flex items-center justify-between space-x-4">
              <div className="flex items-center space-x-3">
                <Badge variant={e.severity === 'high' ? 'destructive' : e.severity === 'warning' ? 'warning' : 'secondary'}>
                  {e.event_type}
                </Badge>
                {e.global_person_id && (
                  <span className="font-mono-apple text-[10px] text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/60">
                    {e.global_person_id}
                  </span>
                )}
                <span className="text-[var(--system-text-primary)] font-medium">{e.student_name || 'Candidate'}</span>
                <span className="text-[var(--system-text-secondary)]">{e.description}</span>
                {e.confidence !== undefined && (
                  <span className="text-[10px] text-slate-400 font-mono-apple">
                    ({Math.round(e.confidence * 100)}% conf)
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-3 text-[var(--system-text-tertiary)] font-mono-apple text-[11px]">
                <span>{e.camera_id}</span>
                <span>{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}
