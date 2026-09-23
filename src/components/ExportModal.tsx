/**
 * src/components/ExportModal.tsx - Exam Data Export Modal
 * Provides customizable CSV and JSON exporting for Candidate Scores,
 * Activity Logs, and Complete Post-Exam Audit Reports for documentation.
 */
import React, { useState } from 'react';
import {
  Download,
  FileText,
  FileCode,
  CheckCircle,
  X,
  Users,
  Activity,
  Calendar,
  Filter,
  ShieldCheck,
} from 'lucide-react';
import { Candidate, ActivityRecord, CameraSource } from '../types.js';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: Candidate[];
  activities: ActivityRecord[];
  cameras: CameraSource[];
  appName?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  candidates,
  activities,
  cameras,
  appName = 'Exam Hall Monitoring Assistant',
}) => {
  const [exportScope, setExportScope] = useState<'full' | 'candidates' | 'activities'>('full');
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [warningFilter, setWarningFilter] = useState<'all' | 'warning_only' | 'high_only'>('all');
  const [includeInactive, setIncludeInactive] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportedSuccess, setExportedSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter candidates based on modal criteria
  const filteredCandidates = candidates.filter((c) => {
    if (!includeInactive && !c.isCurrentlyTracked && !c.activeInFrame) return false;
    if (warningFilter === 'warning_only' && c.warningLevel === 'normal') return false;
    if (warningFilter === 'high_only' && c.warningLevel !== 'high') return false;
    return true;
  });

  const filteredCandidateIds = new Set(filteredCandidates.map((c) => c.id || (c as any).pId));

  // Filter activities corresponding to filtered candidates or scope
  const filteredActivities = activities.filter((act) => {
    if (warningFilter === 'warning_only' && act.warningLevel === 'normal') return false;
    if (warningFilter === 'high_only' && act.warningLevel !== 'high') return false;
    if (warningFilter !== 'all' && !filteredCandidateIds.has(act.pId)) return false;
    return true;
  });

  // Generate CSV string safely escaping quotes and commas
  const generateCsv = (scope: 'full' | 'candidates' | 'activities'): string => {
    const lines: string[] = [];
    const timestampStr = new Date().toISOString();

    if (scope === 'full' || scope === 'candidates') {
      lines.push(`# === EXAM CANDIDATE ROSTER & SCORES ===`);
      lines.push(`# Export Timestamp: ${timestampStr}`);
      lines.push(`# System: ${appName}`);
      lines.push(`Candidate P-ID,Student Name,Seat Number,Score (0-100),Warning Level,Warning Cleared,Tracked Status,First Seen,Last Seen,Notes`);

      filteredCandidates.forEach((c) => {
        const pid = c.id || (c as any).pId || 'P-?';
        const name = (c.studentName || c.name || 'Unassigned').replace(/"/g, '""');
        const seat = (c.seatNumber || 'N/A').replace(/"/g, '""');
        const score = c.currentScore ?? c.score ?? 0;
        const level = c.warningLevel || 'normal';
        const cleared = c.warningCleared ? 'Yes' : 'No';
        const tracked = (c.isCurrentlyTracked || c.activeInFrame) ? 'Active' : 'Ended';
        const firstSeen = c.firstSeen || '';
        const lastSeen = c.lastSeen || '';
        const notes = (c.notes || '').replace(/"/g, '""');

        lines.push(`"${pid}","${name}","${seat}",${score},"${level}","${cleared}","${tracked}","${firstSeen}","${lastSeen}","${notes}"`);
      });

      if (scope === 'full') {
        lines.push(''); // blank row separator
      }
    }

    if (scope === 'full' || scope === 'activities') {
      lines.push(`# === OBSERVED ACTIVITY AUDIT LOG ===`);
      lines.push(`Activity ID,Candidate P-ID,Camera,Activity Type,Details,Score Weight,Score After,Warning Level,Timestamp,Display Time`);

      filteredActivities.forEach((a) => {
        const id = a.id;
        const pid = a.pId;
        const cam = (a.cameraName || a.cameraId || 'Cam-1').replace(/"/g, '""');
        const type = a.activityType.replace(/"/g, '""');
        const details = (a.details || '').replace(/"/g, '""');
        const weight = a.scoreChange > 0 ? `+${a.scoreChange}` : `${a.scoreChange}`;
        const scoreAfter = a.scoreAfter;
        const level = a.warningLevel;
        const ts = a.timestamp || '';
        const timeDisp = a.timeDisplay || '';

        lines.push(`"${id}","${pid}","${cam}","${type}","${details}",${weight},${scoreAfter},"${level}","${ts}","${timeDisp}"`);
      });
    }

    return lines.join('\n');
  };

  // Generate JSON report object
  const generateJson = (scope: 'full' | 'candidates' | 'activities') => {
    const reportMeta = {
      exportTimestamp: new Date().toISOString(),
      appName,
      reportType: scope === 'full' ? 'Full Post-Exam Audit Report' : scope === 'candidates' ? 'Candidate Roster & Scores' : 'Activity Audit Logs',
      metrics: {
        totalCandidates: filteredCandidates.length,
        totalActivities: filteredActivities.length,
        highWarningCandidates: filteredCandidates.filter((c) => c.warningLevel === 'high').length,
        warningCandidates: filteredCandidates.filter((c) => c.warningLevel === 'warning').length,
        normalCandidates: filteredCandidates.filter((c) => c.warningLevel === 'normal').length,
      },
    };

    if (scope === 'candidates') {
      return {
        metadata: reportMeta,
        candidates: filteredCandidates,
      };
    }

    if (scope === 'activities') {
      return {
        metadata: reportMeta,
        activities: filteredActivities,
      };
    }

    // Full export
    return {
      metadata: reportMeta,
      cameras: cameras.map((cam) => ({
        id: cam.id,
        name: cam.name,
        location: cam.location,
        sourceType: cam.sourceType,
      })),
      candidates: filteredCandidates,
      activities: filteredActivities,
    };
  };

  const handleDownload = () => {
    setIsExporting(true);
    setExportedSuccess(null);

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      let fileName = `Exam_Report_${exportScope}_${dateStr}`;
      let content = '';
      let mimeType = '';

      if (exportFormat === 'json') {
        const jsonData = generateJson(exportScope);
        content = JSON.stringify(jsonData, null, 2);
        mimeType = 'application/json';
        fileName += '.json';
      } else {
        content = generateCsv(exportScope);
        mimeType = 'text/csv;charset=utf-8;';
        fileName += '.csv';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportedSuccess(`Successfully generated and downloaded ${fileName}`);
    } catch (err: any) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border transition-colors bg-white border-neutral-200 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-neutral-900 dark:text-white">Export Post-Exam Audit Data</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Download activity logs and examinee scores for official documentation.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer p-1.5 rounded-lg transition-colors text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:text-white dark:hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto max-h-[75vh] text-xs">
          {/* Scope Selector */}
          <div className="space-y-2">
            <label className="block font-semibold uppercase text-[11px] tracking-wider text-neutral-700 dark:text-neutral-300">
              1. Select Data Scope to Export:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setExportScope('full')}
                className={`cursor-pointer p-3 rounded-xl border text-left flex flex-col justify-between transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  exportScope === 'full'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold shadow-sm dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-white'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:bg-neutral-950/60 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">COMPLETE</span>
                </div>
                <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">Full Audit Report</div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">Candidates, scores, activity log, and metadata</div>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('candidates')}
                className={`cursor-pointer p-3 rounded-xl border text-left flex flex-col justify-between transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  exportScope === 'candidates'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold shadow-sm dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-white'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:bg-neutral-950/60 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <Users className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                  <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">ROSTER</span>
                </div>
                <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">Candidates & Scores</div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">Examinee P-IDs, seat numbers, current score</div>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('activities')}
                className={`cursor-pointer p-3 rounded-xl border text-left flex flex-col justify-between transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  exportScope === 'activities'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold shadow-sm dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-white'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:bg-neutral-950/60 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <Activity className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">TIMELINE</span>
                </div>
                <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">Activity Logs</div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">Observed physical movements & timestamps</div>
              </button>
            </div>
          </div>

          {/* Export Format Selector */}
          <div className="space-y-2">
            <label className="block font-semibold uppercase text-[11px] tracking-wider text-neutral-700 dark:text-neutral-300">
              2. Select Export File Format:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat('json')}
                className={`cursor-pointer flex items-center gap-3 p-3 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  exportFormat === 'json'
                    ? 'bg-neutral-100 border-emerald-500 text-neutral-900 dark:bg-neutral-800 dark:border-emerald-500 dark:text-white'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:text-neutral-900 dark:bg-neutral-950/60 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                <FileCode className="w-6 h-6 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-neutral-900 dark:text-white">JSON Document (.json)</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Structured data format for software & archives</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('csv')}
                className={`cursor-pointer flex items-center gap-3 p-3 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  exportFormat === 'csv'
                    ? 'bg-neutral-100 border-emerald-500 text-neutral-900 dark:bg-neutral-800 dark:border-emerald-500 dark:text-white'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:text-neutral-900 dark:bg-neutral-950/60 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                <FileText className="w-6 h-6 text-sky-500 dark:text-sky-400 shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-neutral-900 dark:text-white">CSV Spreadsheet (.csv)</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Open directly in Microsoft Excel or Sheets</div>
                </div>
              </button>
            </div>
          </div>

          {/* Filtering Options */}
          <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800/80">
            <label className="font-semibold uppercase text-[11px] tracking-wider flex items-center gap-1 text-neutral-700 dark:text-neutral-300">
              <Filter className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>3. Filter Criteria (Optional):</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Warning Level Filter:</label>
                <select
                  value={warningFilter}
                  onChange={(e) => setWarningFilter(e.target.value as any)}
                  className="cursor-pointer w-full rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                >
                  <option value="all">Include All Warning Levels</option>
                  <option value="warning_only">Warning & High Warning Only (Score &gt; 35)</option>
                  <option value="high_only">High Warning Only (Score &gt; 70)</option>
                </select>
              </div>

              <div className="flex items-center pt-2 sm:pt-5">
                <label className="flex items-center gap-2 cursor-pointer select-none text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => setIncludeInactive(e.target.checked)}
                    className="cursor-pointer w-4 h-4 rounded text-emerald-500 focus:ring-0"
                  />
                  <span>Include cleared / inactive candidates</span>
                </label>
              </div>
            </div>
          </div>

          {/* Summary Preview Box */}
          <div className="p-3.5 rounded-xl border space-y-1.5 bg-neutral-50 border-neutral-200 dark:bg-neutral-950 dark:border-neutral-800/80">
            <div className="font-medium text-[11px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Export Preview Metrics:</div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-600 dark:text-neutral-300">Target Candidates:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{filteredCandidates.length} examinees</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-600 dark:text-neutral-300">Target Activity Logs:</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{filteredActivities.length} recorded events</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-600 dark:text-neutral-300">File Output:</span>
              <span className="font-semibold uppercase text-sky-600 dark:text-sky-400">{exportFormat} format</span>
            </div>
          </div>

          {/* Success Banner */}
          {exportedSuccess && (
            <div className="p-3 rounded-lg border text-xs flex items-center gap-2 bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/80 dark:border-emerald-800/80 dark:text-emerald-200">
              <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span>{exportedSuccess}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/60">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-4 py-2 rounded-xl text-xs font-medium transition-colors text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting}
            className="cursor-pointer flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold shadow-md transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Generating...' : `Export as ${exportFormat.toUpperCase()}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
