/**
 * Smart Classroom Exam Monitoring System
 * Admin Branding & System Settings Manager
 */

import React, { useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { Settings, Save, Check } from 'lucide-react';

export function AdminBrandingManager() {
  const { settings, refreshData } = useMonitoring();

  const [appName, setAppName] = useState<string>(settings?.app_name || '');
  const [logoText, setLogoText] = useState<string>(settings?.app_logo_text || 'PROCTOR-CV');
  const [classroomTitle, setClassroomTitle] = useState<string>(settings?.classroom_display_title || '');
  const [description, setDescription] = useState<string>(settings?.app_description || '');

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

  return (
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
  );
}
