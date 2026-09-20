/**
 * Apple Human Interface Guidelines Input Field
 */

import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-[13px] font-medium text-[var(--system-text-secondary)]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <span className="absolute left-3.5 text-[var(--system-text-tertiary)] flex-shrink-0 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`w-full bg-[var(--system-fill)] border border-[var(--system-chrome-border)] focus:border-[var(--system-accent)] focus:ring-2 focus:ring-[var(--system-accent-subtle)] text-[var(--system-text-primary)] placeholder-[var(--system-text-tertiary)] text-[14px] rounded-[12px] py-2.5 transition-all outline-none ${
              icon ? 'pl-10 pr-3.5' : 'px-3.5'
            } ${error ? 'border-[var(--system-destructive)] ring-1 ring-[var(--system-destructive)]' : ''} ${className}`}
            {...props}
          />
        </div>
        {error && (
          <p className="text-[12px] text-[var(--system-destructive)] font-medium">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
