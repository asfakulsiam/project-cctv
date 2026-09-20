/**
 * Apple Human Interface Guidelines Modal Sheet Component
 * Mobile: Slides up from bottom with grab handle, safe area inset bottom.
 * Desktop: Centered card or slide-over drawer with frosted glass backdrop.
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
}

export function Sheet({
  isOpen,
  onClose,
  title,
  subtitle,
  description,
  children,
  size = 'md'
}: SheetProps) {
  const effectiveSubtitle = subtitle || description;

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  let desktopWidth = 'max-w-md';
  if (size === 'lg') desktopWidth = 'max-w-2xl';
  if (size === 'sm') desktopWidth = 'max-w-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content Container */}
      <div
        className={`relative z-10 w-full sm:${desktopWidth} bg-[var(--system-secondary-bg)] border-t sm:border-l sm:border-t-0 border-[var(--system-card-border)] rounded-t-[24px] sm:rounded-l-[24px] sm:rounded-t-none max-h-[90vh] sm:max-h-full sm:h-full flex flex-col shadow-[var(--system-shadow-drawer)] overflow-hidden transition-all duration-300 pb-safe`}
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-full flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--system-text-quaternary)]" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--system-separator)] flex items-center justify-between">
          <div>
            {title && (
              <h2 className="text-[17px] font-semibold text-[var(--system-text-primary)]">
                {title}
              </h2>
            )}
            {effectiveSubtitle && (
              <p className="text-[12px] text-[var(--system-text-secondary)] mt-0.5">
                {effectiveSubtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] flex items-center justify-center text-[var(--system-text-secondary)] hover:text-[var(--system-text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
