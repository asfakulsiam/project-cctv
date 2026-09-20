/**
 * Apple Design System Token References & Helper Constants
 */

export const TOKENS = {
  colors: {
    accent: 'var(--system-accent)',
    accentHover: 'var(--system-accent-hover)',
    accentSubtle: 'var(--system-accent-subtle)',
    bg: 'var(--system-bg)',
    secondaryBg: 'var(--system-secondary-bg)',
    tertiaryBg: 'var(--system-tertiary-bg)',
    textPrimary: 'var(--system-text-primary)',
    textSecondary: 'var(--system-text-secondary)',
    textTertiary: 'var(--system-text-tertiary)',
    destructive: 'var(--system-destructive)',
    warning: 'var(--system-warning)',
    success: 'var(--system-success)',
    border: 'var(--system-card-border)',
    separator: 'var(--system-separator)',
  },
  radii: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
    full: 'var(--radius-full)',
  },
  shadows: {
    sm: 'var(--system-shadow-sm)',
    md: 'var(--system-shadow-md)',
    lg: 'var(--system-shadow-lg)',
  }
} as const;

export function cn(...classes: Array<string | boolean | undefined | null>): string {
  return classes.filter(Boolean).join(' ');
}
