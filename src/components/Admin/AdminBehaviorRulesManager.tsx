/**
 * Smart Classroom Exam Monitoring System
 * Admin Behavioral Rules & Suspicion Weight Thresholds Manager
 * 
 * CORE REQUIREMENT:
 * Allows configuring temporal persistence thresholds, glance cooldowns,
 * confidence minimums, and explainable additive scoring weights.
 */

import React, { useState, useEffect } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { Sliders, Save, Check, RotateCcw } from 'lucide-react';

export function AdminBehaviorRulesManager() {
  const { settings, refreshData } = useMonitoring();

  const [thresholds, setThresholds] = useState({
    looking_duration_sec: settings?.thresholds?.looking_duration_sec ?? 3.5,
    face_hidden_duration_sec: settings?.thresholds?.face_hidden_duration_sec ?? 4.0,
    leave_seat_grace_sec: settings?.thresholds?.leave_seat_grace_sec ?? 5.0,
    phone_confidence_min: settings?.thresholds?.phone_confidence_min ?? 0.65,
    warning_threshold: settings?.thresholds?.warning_suspicion_threshold ?? 35,
    high_suspicion_threshold: settings?.thresholds?.high_suspicion_threshold ?? 65
  });

  const [weights, setWeights] = useState({
    face_hidden: settings?.suspicion_weights?.face_hidden ?? 20,
    phone_detected: settings?.suspicion_weights?.phone_detected ?? 40,
    repeated_looking: settings?.suspicion_weights?.repeated_looking ?? 25,
    leaving_seat: settings?.suspicion_weights?.leaving_seat ?? 30,
    abnormal_movement: settings?.suspicion_weights?.abnormal_movement ?? 15
  });

  useEffect(() => {
    if (settings?.thresholds) {
      setThresholds({
        looking_duration_sec: settings.thresholds.looking_duration_sec ?? 3.5,
        face_hidden_duration_sec: settings.thresholds.face_hidden_duration_sec ?? 4.0,
        leave_seat_grace_sec: settings.thresholds.leave_seat_grace_sec ?? 5.0,
        phone_confidence_min: settings.thresholds.phone_confidence_min ?? 0.65,
        warning_threshold: settings.thresholds.warning_suspicion_threshold ?? 35,
        high_suspicion_threshold: settings.thresholds.high_suspicion_threshold ?? 65
      });
    }
    if (settings?.suspicion_weights) {
      setWeights({
        face_hidden: settings.suspicion_weights.face_hidden ?? 20,
        phone_detected: settings.suspicion_weights.phone_detected ?? 40,
        repeated_looking: settings.suspicion_weights.repeated_looking ?? 25,
        leaving_seat: settings.suspicion_weights.leaving_seat ?? 30,
        abnormal_movement: settings.suspicion_weights.abnormal_movement ?? 15
      });
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
          thresholds: {
            ...thresholds,
            warning_suspicion_threshold: thresholds.warning_threshold
          },
          suspicion_weights: weights
        })
      });

      if (res.ok) {
        setFeedback('Behavior analysis rules and weights dynamically updated across CV engine.');
        await refreshData();
        setTimeout(() => setFeedback(null), 3500);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <span>Temporal Rules &amp; Suspicion Score Weights</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Define persistence durations to eliminate single-frame false positives and balance penalty weights.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : 'Apply Rules to Engine'}</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg text-xs bg-emerald-950/80 border border-emerald-800 text-emerald-300">
          <span>{feedback}</span>
        </div>
      )}

      {/* Thresholds Section */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
        <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
          1. Temporal Duration &amp; Persistence Thresholds
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Sustained Head Turn Duration (sec)
            </label>
            <input
              type="number"
              step="0.5"
              min="1.0"
              max="15.0"
              value={thresholds.looking_duration_sec}
              onChange={e => setThresholds({ ...thresholds, looking_duration_sec: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Time gaze must face left/right before triggering alert (prevents glance false alarms)
            </span>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Face Occlusion Grace Period (sec)
            </label>
            <input
              type="number"
              step="0.5"
              min="1.0"
              max="15.0"
              value={thresholds.face_hidden_duration_sec}
              onChange={e => setThresholds({ ...thresholds, face_hidden_duration_sec: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Continuous duration face landmarks must be hidden before alerting
            </span>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Leaving Desk Grace Window (sec)
            </label>
            <input
              type="number"
              step="0.5"
              min="1.0"
              max="30.0"
              value={thresholds.leave_seat_grace_sec}
              onChange={e => setThresholds({ ...thresholds, leave_seat_grace_sec: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Time allowed outside assigned desk bounds before penalty activates
            </span>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Mobile Phone Confidence Floor
            </label>
            <input
              type="number"
              step="0.05"
              min="0.3"
              max="0.99"
              value={thresholds.phone_confidence_min}
              onChange={e => setThresholds({ ...thresholds, phone_confidence_min: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Minimum detector confidence (0.0 - 1.0) to register mobile device
            </span>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Warning Severity Threshold (pts)
            </label>
            <input
              type="number"
              min="10"
              max="50"
              value={thresholds.warning_threshold}
              onChange={e => setThresholds({ ...thresholds, warning_threshold: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-amber-400 font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Suspicion score index activating yellow attention state
            </span>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              High Alert Threshold (pts)
            </label>
            <input
              type="number"
              min="40"
              max="90"
              value={thresholds.high_suspicion_threshold}
              onChange={e => setThresholds({ ...thresholds, high_suspicion_threshold: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-rose-400 font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Suspicion score index activating red elevated monitoring
            </span>
          </div>
        </div>
      </div>

      {/* Weights Section */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
        <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
          2. Explainable Additive Suspicion Score Weights (0 - 100 Index)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Phone Detection Penalty (+pts)
            </label>
            <input
              type="number"
              min="10"
              max="80"
              value={weights.phone_detected}
              onChange={e => setWeights({ ...weights, phone_detected: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Leaving Desk Penalty (+pts)
            </label>
            <input
              type="number"
              min="10"
              max="60"
              value={weights.leaving_seat}
              onChange={e => setWeights({ ...weights, leaving_seat: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Sustained Head Turn Penalty (+pts)
            </label>
            <input
              type="number"
              min="5"
              max="50"
              value={weights.repeated_looking}
              onChange={e => setWeights({ ...weights, repeated_looking: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Face Occlusion Penalty (+pts)
            </label>
            <input
              type="number"
              min="5"
              max="50"
              value={weights.face_hidden}
              onChange={e => setWeights({ ...weights, face_hidden: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Abnormal Motion Penalty (+pts)
            </label>
            <input
              type="number"
              min="5"
              max="30"
              value={weights.abnormal_movement}
              onChange={e => setWeights({ ...weights, abnormal_movement: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono"
            />
          </div>
        </div>
      </div>

    </form>
  );
}
