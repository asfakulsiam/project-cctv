/**
 * Apple Human Interface Guidelines Modal Dialog Component
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md'
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let widthClass = 'max-w-md';
  if (size === 'sm') widthClass = 'max-w-sm';
  if (size === 'lg') widthClass = 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog Box */}
      <div
        className={`relative z-10 w-full ${widthClass} bg-[var(--system-secondary-bg)] border border-[var(--system-card-border)] rounded-[20px] shadow-[var(--system-shadow-lg)] overflow-hidden transition-all`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--system-separator)] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[var(--system-text-primary)]">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[var(--system-fill)] hover:bg-[var(--system-fill-secondary)] flex items-center justify-center text-[var(--system-text-secondary)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 text-[14px] text-[var(--system-text-secondary)]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-3.5 bg-[var(--system-tertiary-bg)] border-t border-[var(--system-separator)] flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
