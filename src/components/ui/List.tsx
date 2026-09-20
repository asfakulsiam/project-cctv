/**
 * Apple Human Interface Guidelines Grouped List & ListItem
 */

import React from 'react';

export function List({
  children,
  header,
  footer,
  className = ''
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {header && (
        <div className="px-3.5 text-[12px] font-semibold uppercase tracking-wider text-[var(--system-text-tertiary)]">
          {header}
        </div>
      )}
      <div className="bg-[var(--system-secondary-bg)] border border-[var(--system-card-border)] rounded-[16px] overflow-hidden divide-y divide-[var(--system-separator)] shadow-sm">
        {children}
      </div>
      {footer && (
        <div className="px-3.5 text-[11px] text-[var(--system-text-secondary)]">
          {footer}
        </div>
      )}
    </div>
  );
}

export function ListItem({
  title,
  subtitle,
  icon,
  accessory,
  onClick,
  active = false,
  className = ''
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  accessory?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 flex items-center justify-between gap-3 select-none transition-colors min-h-[48px] ${
        isClickable ? 'cursor-pointer hover:bg-[var(--system-fill)] active:bg-[var(--system-fill-secondary)]' : ''
      } ${active ? 'bg-[var(--system-accent-subtle)]' : ''} ${className}`}
    >
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        {icon && (
          <div className="flex-shrink-0 text-[var(--system-accent)]">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-[var(--system-text-primary)] truncate">
            {title}
          </div>
          {subtitle && (
            <div className="text-[12px] text-[var(--system-text-secondary)] truncate mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {accessory && (
        <div className="flex-shrink-0 text-[var(--system-text-tertiary)]">
          {accessory}
        </div>
      )}
    </div>
  );
}
