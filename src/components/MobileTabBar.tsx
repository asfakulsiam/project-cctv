/**
 * Apple Human Interface Guidelines Mobile Tab Bar
 * Fixed frosted glass bottom navigation bar with safe-area inset support,
 * minimum 44px tap targets, and smooth spring feedback.
 */

import React from 'react';
import { Video, Radio, FileText } from 'lucide-react';

interface MobileTabBarProps {
  currentView: 'player' | 'timeline' | 'reports';
  onNavigate: (view: 'player' | 'timeline' | 'reports') => void;
  alertCount?: number;
}

export function MobileTabBar({ currentView, onNavigate, alertCount = 0 }: MobileTabBarProps) {
  const tabs = [
    {
      id: 'player' as const,
      label: 'Live Feed',
      icon: Video
    },
    {
      id: 'timeline' as const,
      label: 'Activity',
      icon: Radio,
      badge: alertCount > 0 ? alertCount : undefined
    },
    {
      id: 'reports' as const,
      label: 'Reports',
      icon: FileText
    }
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--system-chrome-bg)] backdrop-blur-2xl border-t border-[var(--system-chrome-border)] pb-safe transition-all"
    >
      <div className="grid grid-cols-3 h-14 max-w-md mx-auto px-2">
        {tabs.map(tab => {
          const isActive = currentView === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`relative flex flex-col items-center justify-center min-h-[48px] py-1 transition-all duration-200 cursor-pointer select-none active:scale-95 ${
                isActive
                  ? 'text-[var(--system-accent)] font-semibold'
                  : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] font-normal'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : 'scale-100'}`} />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 px-1.5 py-0.2 rounded-full text-[10px] font-mono-apple font-bold bg-[var(--system-destructive)] text-white ring-2 ring-[var(--system-secondary-bg)]">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-1">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
