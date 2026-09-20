/**
 * Apple Human Interface Guidelines Admin Layout & Authentication Gateway
 * Completely isolated administration route with secure token verification,
 * Cupertino segmented tabs, and responsive layout.
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
  ArrowLeft,
  KeyRound
} from 'lucide-react';
import { Card } from '../ui/Card.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';

interface AdminLayoutProps {
  onExitAdmin: () => void;
}

type AdminTab = 'students' | 'cameras' | 'rules' | 'branding';

export function AdminLayout({ onExitAdmin }: AdminLayoutProps) {
  const { stats, session, cameras, students } = useMonitoring();

  // Authentication State - no pre-filled credentials
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
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
    } catch {
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
  // Unauthenticated: Apple HIG Admin Gate View
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <Card padding="lg" className="w-full max-w-md space-y-6">
          
          <div className="text-center">
            <div className="w-12 h-12 rounded-[14px] bg-[var(--system-accent-subtle)] flex items-center justify-center mx-auto mb-3 text-[var(--system-accent)]">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-[20px] font-semibold text-[var(--system-text-primary)] tracking-tight">
              Administration Portal
            </h2>
            <p className="text-[13px] text-[var(--system-text-secondary)] mt-1">
              Protected Academic Management & Configuration Console
            </p>
          </div>

          {loginError && (
            <div className="p-3 rounded-[12px] bg-[var(--system-destructive-subtle)] border border-[var(--system-destructive)]/30 text-[var(--system-destructive)] text-[12px] flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Admin Username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              required
              autoFocus
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
            />

            <div className="pt-2 flex items-center space-x-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={onExitAdmin}
                className="w-1/3"
              >
                Back
              </Button>

              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                className="w-2/3"
                icon={KeyRound}
              >
                {isSubmitting ? 'Authenticating...' : 'Sign In'}
              </Button>
            </div>
          </form>

        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Authenticated Admin Dashboard Layout
  // -------------------------------------------------------------
  return (
    <div className="bg-[var(--system-secondary-bg)] border border-[var(--system-card-border)] rounded-[20px] overflow-hidden shadow-[var(--system-shadow-md)] flex flex-col md:flex-row min-h-[680px]">
      
      {/* Admin Sidebar Navigation */}
      <div className="w-full md:w-64 bg-[var(--system-chrome-bg)] border-b md:border-b-0 md:border-r border-[var(--system-chrome-border)] p-4 flex flex-col justify-between">
        <div className="space-y-6">
          
          {/* Admin Header */}
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-[9px] bg-[var(--system-accent)] flex items-center justify-center text-white shadow-sm">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-[14px] text-[var(--system-text-primary)]">System Admin</h3>
                <span className="text-[10px] text-[var(--system-accent)] font-mono-apple font-medium">AUTHENTICATED</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 text-[13px]">
            <button
              onClick={() => setActiveTab('students')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-[10px] font-medium transition-colors cursor-pointer text-left ${
                activeTab === 'students'
                  ? 'bg-[var(--system-accent)] text-white font-semibold shadow-sm'
                  : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] hover:bg-[var(--system-fill)]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Students &amp; ID Numbers</span>
            </button>

            <button
              onClick={() => setActiveTab('cameras')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-[10px] font-medium transition-colors cursor-pointer text-left ${
                activeTab === 'cameras'
                  ? 'bg-[var(--system-accent)] text-white font-semibold shadow-sm'
                  : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] hover:bg-[var(--system-fill)]'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Cameras &amp; Feeds</span>
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-[10px] font-medium transition-colors cursor-pointer text-left ${
                activeTab === 'rules'
                  ? 'bg-[var(--system-accent)] text-white font-semibold shadow-sm'
                  : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] hover:bg-[var(--system-fill)]'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>CV Rules &amp; Weights</span>
            </button>

            <button
              onClick={() => setActiveTab('branding')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-[10px] font-medium transition-colors cursor-pointer text-left ${
                activeTab === 'branding'
                  ? 'bg-[var(--system-accent)] text-white font-semibold shadow-sm'
                  : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] hover:bg-[var(--system-fill)]'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings &amp; Branding</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="pt-4 border-t border-[var(--system-separator)] space-y-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={onExitAdmin}
            icon={ArrowLeft}
          >
            Return to Live
          </Button>

          <Button
            variant="destructive"
            fullWidth
            onClick={handleLogout}
            icon={LogOut}
          >
            Sign Out
          </Button>
        </div>

      </div>

      {/* Admin Content Canvas */}
      <div className="flex-1 p-5 md:p-6 bg-[var(--system-bg)] overflow-y-auto">
        {activeTab === 'students' && <AdminStudentsManager />}
        {activeTab === 'cameras' && <AdminCamerasManager />}
        {activeTab === 'rules' && <AdminBehaviorRulesManager />}
        {activeTab === 'branding' && <AdminBrandingManager />}
      </div>

    </div>
  );
}
