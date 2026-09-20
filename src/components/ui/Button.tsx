/**
 * Apple Human Interface Guidelines Button Component
 * Supports primary, secondary, subtle, ghost, and destructive variants
 * Features subtle spring press feedback, Apple corner radii, and 44x44px minimum tap targets.
 */

import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      icon,
      iconPosition = 'left',
      fullWidth = false,
      isLoading = false,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    // Base styles: system font, spring transition, min 44px tap target
    let baseStyles = 'inline-flex items-center justify-center font-medium select-none transition-all duration-200 outline-none cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 min-h-[44px]';

    if (fullWidth) {
      baseStyles += ' w-full';
    }

    // Size variants
    let sizeStyles = '';
    switch (size) {
      case 'sm':
        sizeStyles = 'text-[13px] px-3.5 py-1.5 rounded-[10px] gap-1.5 min-h-[36px] sm:min-h-[40px]';
        break;
      case 'lg':
        sizeStyles = 'text-[16px] px-6 py-3 rounded-[16px] gap-2.5 min-h-[48px]';
        break;
      case 'md':
      default:
        sizeStyles = 'text-[14px] px-4 py-2 rounded-[12px] gap-2 min-h-[44px]';
        break;
    }

    // Apple Style Variants
    let variantStyles = '';
    switch (variant) {
      case 'primary':
        variantStyles = 'bg-[var(--system-accent)] hover:opacity-90 text-white font-semibold shadow-[var(--system-shadow-sm)]';
        break;
      case 'destructive':
        variantStyles = 'bg-[var(--system-destructive-subtle)] text-[var(--system-destructive)] hover:bg-[var(--system-destructive)] hover:text-white border border-[var(--system-destructive)]/20';
        break;
      case 'subtle':
        variantStyles = 'bg-[var(--system-accent-subtle)] text-[var(--system-accent)] hover:opacity-80';
        break;
      case 'ghost':
        variantStyles = 'bg-transparent text-[var(--system-text-primary)] hover:bg-[var(--system-fill)]';
        break;
      case 'secondary':
      default:
        variantStyles = 'bg-[var(--system-fill)] text-[var(--system-text-primary)] hover:bg-[var(--system-fill-secondary)] border border-[var(--system-chrome-border)]';
        break;
    }

    const renderIcon = () => {
      if (!icon) return null;
      if (React.isValidElement(icon)) return icon;
      if (typeof icon === 'function') {
        const IconComponent = icon as React.ComponentType<{ className?: string }>;
        return <IconComponent className="w-4 h-4 flex-shrink-0" />;
      }
      return null;
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : (
          icon && iconPosition === 'left' && renderIcon()
        )}
        
        {children && <span>{children}</span>}
        
        {!isLoading && icon && iconPosition === 'right' && renderIcon()}
      </button>
    );
  }
);

Button.displayName = 'Button';
