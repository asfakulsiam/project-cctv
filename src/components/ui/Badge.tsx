/**
 * Apple Human Interface Guidelines Capsule Badge
 */

import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
  className?: string;
  variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'destructive' | 'info' | 'secondary';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  ...props
}: BadgeProps) {
  let sizeStyles = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-[12px] px-2.5 py-1';

  let variantStyles = '';
  let dotColor = 'bg-current';
  switch (variant) {
    case 'accent':
      variantStyles = 'bg-[var(--system-accent-subtle)] text-[var(--system-accent)] border border-[var(--system-accent)]/20';
      dotColor = 'bg-[var(--system-accent)]';
      break;
    case 'success':
      variantStyles = 'bg-[var(--system-success-subtle)] text-[var(--system-success)] border border-[var(--system-success)]/20';
      dotColor = 'bg-[var(--system-success)]';
      break;
    case 'warning':
      variantStyles = 'bg-[var(--system-warning-subtle)] text-[var(--system-warning)] border border-[var(--system-warning)]/20';
      dotColor = 'bg-[var(--system-warning)]';
      break;
    case 'destructive':
      variantStyles = 'bg-[var(--system-destructive-subtle)] text-[var(--system-destructive)] border border-[var(--system-destructive)]/20';
      dotColor = 'bg-[var(--system-destructive)]';
      break;
    case 'info':
      variantStyles = 'bg-[var(--system-info-subtle)] text-[var(--system-info)] border border-[var(--system-info)]/20';
      dotColor = 'bg-[var(--system-info)]';
      break;
    case 'secondary':
    case 'neutral':
    default:
      variantStyles = 'bg-[var(--system-fill)] text-[var(--system-text-secondary)] border border-[var(--system-card-border)]';
      dotColor = 'bg-[var(--system-text-secondary)]';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium font-mono-apple rounded-full ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      {children}
    </span>
  );
}
