/**
 * Smart Classroom Exam Monitoring System
 * Admin Branding & System Settings Manager
 */

import React, { useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { Settings, Save, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';

export function AdminBrandingManager() {
  const { settings, refreshData } = useMonitoring();

  const [appName, setAppName] = useState<string>(settings?.app_name || '');
  const [logoText, setLogoText] = useState<string>(settings?.app_logo_text || 'PROCTOR-CV');
  const [classroomTitle, setClassroomTitle] = useState<string>(settings?.classroom_display_title || '');
  const [description, setDescription] = useState<string>(settings?.app_description || '');

  // Reset / Clear Database state
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [selectedScopes, setSelectedScopes] = useState<{
    students: boolean;
    global_persons: boolean;
    events: boolean;
    seats: boolean;
  }>({
    students: true,
    global_persons: true,
    events: true,
    seats: false
  });
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [clearResult, setClearResult] = useState<string | null>(null);

  React.useEffect(() => {
    if (settings) {
      if (settings.app_name) setAppName(settings.app_name);
      if (settings.app_logo_text) setLogoText(settings.app_logo_text);
      if (settings.classroom_display_title) setClassroomTitle(settings.classroom_display_title);
      if (settings.app_description) setDescription(settings.app_description);
    }
  }, [settings]);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const token = localStorage.getItem('admin_token');

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_name: appName.trim(),
          app_logo_text: logoText.trim(),
          classroom_display_title: classroomTitle.trim(),
          app_description: description.trim()
        })
      });

      if (res.ok) {
        setFeedback('Branding and institutional title settings updated successfully.');
        await refreshData();
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteReset = async () => {
    setIsClearing(true);
    setClearResult(null);
    const token = localStorage.getItem('admin_token');

    const scopes = Object.entries(selectedScopes)
      .filter(([_, enabled]) => enabled)
      .map(([scope]) => scope);

    if (scopes.length === 0) {
      setClearResult('Please select at least one database scope to clear.');
      setIsClearing(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/data/clear', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ scopes })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setClearResult(`Successfully cleared: ${JSON.stringify(data.cleared)}`);
        await refreshData();
        setTimeout(() => {
          setShowResetModal(false);
          setClearResult(null);
        }, 2500);
      } else {
        setClearResult(data.error || 'Failed to clear database records.');
      }
    } catch (err: any) {
      setClearResult('Error connecting to reset endpoint.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSave} className="space-y-5">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Settings className="w-5 h-5 text-indigo-400" />
              <span>Institutional Branding &amp; Display Parameters</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize the system title, academic branding, and classroom venue display text.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>

        {feedback && (
          <div className="p-3 rounded-lg text-xs bg-emerald-950/80 border border-emerald-800 text-emerald-300">
            <span>{feedback}</span>
          </div>
        )}

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Application Title
            </label>
            <input
              type="text"
              value={appName}
              onChange={e => setAppName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              App Logo Brand Badge
            </label>
            <input
              type="text"
              value={logoText}
              onChange={e => setLogoText(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Classroom / Examination Hall Display Title
            </label>
            <input
              type="text"
              value={classroomTitle}
              onChange={e => setClassroomTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Institutional Description &amp; Purpose
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white leading-relaxed"
            />
          </div>
        </div>

      </form>

      {/* Database Cleanup & Maintenance Section */}
      <div className="pt-6 border-t border-slate-800 space-y-4">
        <div>
          <h3 className="text-base font-bold text-red-400 flex items-center space-x-2">
            <Trash2 className="w-5 h-5 text-red-400" />
            <span>Database Cleanup &amp; Session Reset</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Reset runtime examination data, purge historical events, or remove registered students while preserving camera feeds and system configuration.
          </p>
        </div>

        <div className="bg-slate-950 border border-red-900/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-white">Clear Examination State</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Selectively purge runtime P-IDs, registered student list, audit event logs, or seat maps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md shadow-red-600/30 self-start sm:self-auto"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear / Reset Data</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 text-xs text-slate-200">
            <div className="flex items-center space-x-3 text-red-400">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <div>
                <h4 className="text-base font-bold text-white">Confirm Database Cleanup</h4>
                <p className="text-xs text-slate-400">Select data categories to purge from the system:</p>
              </div>
            </div>

            <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedScopes.students}
                  onChange={e => setSelectedScopes(prev => ({ ...prev, students: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-900 text-red-500 focus:ring-red-500"
                />
                <span>Registered Students Database</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedScopes.global_persons}
                  onChange={e => setSelectedScopes(prev => ({ ...prev, global_persons: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-900 text-red-500 focus:ring-red-500"
                />
                <span>Runtime Person Tracks (P-IDs)</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedScopes.events}
                  onChange={e => setSelectedScopes(prev => ({ ...prev, events: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-900 text-red-500 focus:ring-red-500"
                />
                <span>Behavior &amp; Activity Audit Event Logs</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedScopes.seats}
                  onChange={e => setSelectedScopes(prev => ({ ...prev, seats: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-900 text-red-500 focus:ring-red-500"
                />
                <span>Classroom Seat Layouts</span>
              </label>
            </div>

            {clearResult && (
              <div className="p-3 rounded-lg text-xs bg-slate-950 border border-slate-700 text-slate-200">
                {clearResult}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isClearing}
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isClearing}
                onClick={handleExecuteReset}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md shadow-red-600/30"
              >
                {isClearing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Clear Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
