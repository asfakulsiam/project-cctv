/**
 * Smart Classroom Exam Monitoring System
 * Protected Admin Layout & Authentication Gateway
 * 
 * CORE REQUIREMENT:
 * - Completely separate admin layout and navigation.
 * - Protected by environment-configured username & password.
 * - Manages students, student ID corrections, cameras, primary camera selection,
 *   seat mapping, behavior weights, and system branding.
 */

import React, { useState, useEffect } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { AdminStudentsManager } from './AdminStudentsManager.js';
import { AdminCamerasManager } from './AdminCamerasManager.js';
import { AdminBehaviorRulesManager } from './AdminBehaviorRulesManager.js';
import { AdminBrandingManager } from './AdminBrandingManager.js';
import { 
  ShieldCheck, 
  Users, 
  Video, 
  Sliders, 
  Settings, 
  LogOut, 
  Lock, 
  AlertCircle, 
  Activity, 
  ArrowLeft,
  KeyRound,
  FileSpreadsheet
} from 'lucide-react';

interface AdminLayoutProps {
  onExitAdmin: () => void;
}

type AdminTab = 'students' | 'cameras' | 'rules' | 'branding' | 'overview';

export function AdminLayout({ onExitAdmin }: AdminLayoutProps) {
  const { stats, session, cameras, students } = useMonitoring();

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('academic_exam_2026');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active Admin Sub-tab
  const [activeTab, setActiveTab] = useState<AdminTab>('students');

  // Verify existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('admin_token');
        }
      })
      .catch(() => localStorage.removeItem('admin_token'));
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('admin_token', data.token);
        setIsAuthenticated(true);
      } else {
        setLoginError(data.error || 'Invalid administrator credentials');
      }
    } catch (err: any) {
      setLoginError('Connection failure during authentication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
  };

  // -------------------------------------------------------------
  // Unauthenticated: Secure Admin Gate View
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-3 text-indigo-400">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white">Administrator Portal</h2>
            <p className="text-xs text-slate-400 mt-1">
              Protected Academic Management & Configuration Console
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Admin Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:border-indigo-500 focus:outline-none"
                placeholder="admin"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Administrator Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:border-indigo-500 focus:outline-none"
                placeholder="••••••••••••"
                required
              />
            </div>

            <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 font-mono">
              Default Academic Credential: <strong className="text-indigo-300">admin</strong> / <strong className="text-indigo-300">academic_exam_2026</strong>
            </div>

            <div className="pt-2 flex items-center space-x-2">
              <button
                type="button"
                onClick={onExitAdmin}
                className="w-1/3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
              >
                Back
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-2/3 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center space-x-1.5"
              >
                <KeyRound className="w-4 h-4" />
                <span>{isSubmitting ? 'Authenticating...' : 'Sign In as Admin'}</span>
              </button>
            </div>
          </form>

        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Authenticated Admin Dashboard Layout
  // -------------------------------------------------------------
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row min-h-[680px]">
      
      {/* Admin Sidebar Navigation */}
      <div className="w-full md:w-64 bg-slate-950 border-b md:border-b-0 md:border-r border-slate-800 p-4 flex flex-col justify-between">
        <div className="space-y-6">
          
          {/* Admin Header */}
          <div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">System Admin</h3>
                <span className="text-[10px] text-indigo-400 font-mono">AUTHENTICATED</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 text-xs">
            <button
              onClick={() => setActiveTab('students')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                activeTab === 'students'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Students &amp; ID Numbers</span>
            </button>

            <button
              onClick={() => setActiveTab('cameras')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                activeTab === 'cameras'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Cameras &amp; Primary View</span>
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                activeTab === 'rules'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>CV Rules &amp; Weights</span>
            </button>

            <button
              onClick={() => setActiveTab('branding')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                activeTab === 'branding'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings &amp; Branding</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          <button
            onClick={onExitAdmin}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Live Player</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 text-xs font-semibold border border-rose-900/40 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>

      </div>

      {/* Admin Content Canvas */}
      <div className="flex-1 p-5 md:p-6 bg-slate-900/50 overflow-y-auto">
        {activeTab === 'students' && <AdminStudentsManager />}
        {activeTab === 'cameras' && <AdminCamerasManager />}
        {activeTab === 'rules' && <AdminBehaviorRulesManager />}
        {activeTab === 'branding' && <AdminBrandingManager />}
      </div>

    </div>
  );
}
