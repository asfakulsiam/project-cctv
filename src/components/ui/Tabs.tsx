/**
 * Apple Human Interface Guidelines Segmented Control (Tabs)
 * Pill-style selector with smooth spring background transition
 */

import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

export function Tabs({
  items,
  activeId,
  onChange,
  size = 'md',
  fullWidth = false,
  className = ''
}: TabsProps) {
  const containerPadding = size === 'sm' ? 'p-1' : 'p-1.5';
  const itemPadding = size === 'sm' ? 'px-3 py-1 text-[12px]' : 'px-4 py-1.5 text-[13px]';

  return (
    <div
      role="tablist"
      className={`inline-flex items-center bg-[var(--system-fill)] border border-[var(--system-chrome-border)] rounded-[14px] ${containerPadding} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {items.map(item => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={`relative flex items-center justify-center gap-1.5 font-medium rounded-[10px] select-none transition-all duration-200 outline-none cursor-pointer min-h-[36px] ${
              fullWidth ? 'flex-1' : ''
            } ${itemPadding} ${
              isActive
                ? 'bg-[var(--system-secondary-bg)] text-[var(--system-text-primary)] shadow-sm font-semibold'
                : 'text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)]'
            }`}
          >
            {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono-apple font-bold ${
                  isActive
                    ? 'bg-[var(--system-accent)] text-white'
                    : 'bg-[var(--system-fill-secondary)] text-[var(--system-text-secondary)]'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
