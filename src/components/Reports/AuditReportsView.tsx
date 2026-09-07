/**
 * Smart Classroom Exam Monitoring System
 * Academic Audit Reports & Incident Export View
 */

import React, { useEffect, useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Users, 
  Video, 
  Printer,
  Calendar,
  Clock
} from 'lucide-react';

export function AuditReportsView() {
  const { session, students, cameras, events } = useMonitoring();
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  const highRisk = students.filter(s => s.unified_suspicion_score >= 60);
  const warnings = students.filter(s => s.unified_suspicion_score >= 35 && s.unified_suspicion_score < 60);

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">
              OFFICIAL RECORD
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Session #{session?.session_code || 'UNSCHEDULED'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-white mt-1">
            Exam Session Behavioral Audit & Incident Summary
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {session ? `${session.title} • ${session.course_code}` : 'No active examination session scheduled'}
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Export Incident CSV</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
          >
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>Export Full JSON</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 uppercase font-medium">Present Candidates</span>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {students.filter(s => s.status === 'present' || s.status === 'flagged').length}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1 block">
            {students.length} Registered
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 uppercase font-medium">Elevated Monitoring</span>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
            {highRisk.length}
          </div>
          <span className="text-[10px] text-rose-500/80 font-mono mt-1 block">
            Score &ge; 60 pts
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 uppercase font-medium">Attention Warnings</span>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
            {warnings.length}
          </div>
          <span className="text-[10px] text-amber-500/80 font-mono mt-1 block">
            Score 35 - 59 pts
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 uppercase font-medium">Logged CV Incidents</span>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
            {events.length}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1 block">
            Across {cameras.length} cameras
          </span>
        </div>
      </div>

      {/* Student Audit Roster */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Student Incident Breakdown & Monitoring Status
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            Ground-Truth Identity Mapping
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
              <tr>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Student ID Number</th>
                <th className="px-4 py-3">Assigned Desk</th>
                <th className="px-4 py-3">Attendance</th>
                <th className="px-4 py-3">Suspicion Score</th>
                <th className="px-4 py-3">Observation Coverage</th>
                <th className="px-4 py-3">Status Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No candidates registered or present in this examination session.
                  </td>
                </tr>
              )}
              {students.map(s => {
                const isHigh = s.unified_suspicion_score >= 60;
                const isWarn = s.unified_suspicion_score >= 35 && !isHigh;

                return (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {s.student_id_number}
                    </td>
                    <td className="px-4 py-3 font-mono text-cyan-400">
                      {s.seat_id ? s.seat_id.toUpperCase() : 'Unassigned'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                        s.status === 'present' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' :
                        s.status === 'flagged' ? 'bg-rose-950 text-rose-400 border border-rose-800/40' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold">
                      <span className={isHigh ? 'text-rose-400' : isWarn ? 'text-amber-400' : 'text-slate-300'}>
                        {s.unified_suspicion_score} pts
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {s.active_observations.length > 0 ? (
                        <span className="font-mono text-[11px] text-cyan-400">
                          {s.active_observations.map(o => o.camera_id.toUpperCase()).join(', ')}
                        </span>
                      ) : (
                        <span className="text-slate-600">No active view</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isHigh ? (
                        <span className="text-rose-400 font-semibold flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Review Recommended</span>
                        </span>
                      ) : isWarn ? (
                        <span className="text-amber-400 flex items-center space-x-1">
                          <span>Minor Anomalies</span>
                        </span>
                      ) : (
                        <span className="text-emerald-400 flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Within Norm</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Log Sample */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Recorded Examination Incident Log (Last 15 Records)
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            Immutable Audit Trail
          </span>
        </div>

        <div className="divide-y divide-slate-800/80 text-xs">
          {events.length === 0 && (
            <div className="p-6 text-center text-slate-500">
              No behavioral incidents or system warnings logged for this session.
            </div>
          )}
          {events.slice(0, 15).map((e, idx) => (
            <div key={`${e.id}-${idx}`} className="p-3 flex items-center justify-between space-x-4">
              <div className="flex items-center space-x-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                  e.severity === 'high' ? 'bg-rose-950 text-rose-400 border border-rose-800/40' :
                  e.severity === 'warning' ? 'bg-amber-950 text-amber-400 border border-amber-800/40' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {e.event_type}
                </span>
                <span className="text-white font-medium">{e.student_name || 'Subject'}</span>
                <span className="text-slate-400">{e.description}</span>
              </div>
              <div className="flex items-center space-x-3 text-slate-500 font-mono text-[11px]">
                <span>{e.camera_id.toUpperCase()}</span>
                <span>{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
