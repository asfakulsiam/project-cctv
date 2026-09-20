/**
 * Apple Human Interface Guidelines Card Component
 * Grouped background, subtle border, layered shadow, translucent optional surface
 */

import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  glass?: boolean;
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  glass = false,
  interactive = false,
  padding = 'md',
  className = '',
  ...props
}: CardProps) {
  let paddingStyles = '';
  switch (padding) {
    case 'none':
      paddingStyles = 'p-0';
      break;
    case 'sm':
      paddingStyles = 'p-3.5';
      break;
    case 'lg':
      paddingStyles = 'p-6';
      break;
    case 'md':
    default:
      paddingStyles = 'p-4 sm:p-5';
      break;
  }

  const surfaceStyles = glass ? 'apple-glass' : 'apple-card';
  const interactiveStyles = interactive ? 'apple-card-interactive cursor-pointer' : '';

  return (
    <div
      className={`rounded-[18px] overflow-hidden ${surfaceStyles} ${interactiveStyles} ${paddingStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className = ''
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 pb-3.5 mb-3.5 border-b border-[var(--system-separator)] ${className}`}>
      <div className="flex items-center space-x-2.5 min-w-0">
        {icon && (
          <div className="w-8 h-8 rounded-[10px] bg-[var(--system-fill)] flex items-center justify-center flex-shrink-0 text-[var(--system-accent)]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold tracking-tight text-[var(--system-text-primary)] truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[12px] text-[var(--system-text-secondary)] mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
