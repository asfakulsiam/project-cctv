/**
 * Apple Human Interface Guidelines Shimmer Skeleton Component
 */

import React from 'react';

export function Skeleton({
  className = '',
  variant = 'rounded',
  width,
  height
}: {
  className?: string;
  variant?: 'circular' | 'rounded' | 'text';
  width?: string | number;
  height?: string | number;
}) {
  let radiusStyle = 'rounded-[12px]';
  if (variant === 'circular') radiusStyle = 'rounded-full';
  if (variant === 'text') radiusStyle = 'rounded-[6px] h-4';

  return (
    <div
      className={`relative overflow-hidden bg-[var(--system-fill)] animate-pulse ${radiusStyle} ${className}`}
      style={{
        width: width !== undefined ? width : undefined,
        height: height !== undefined ? height : undefined
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-[var(--system-secondary-bg)] border border-[var(--system-card-border)] rounded-[18px] p-5 space-y-4">
      <div className="flex items-center space-x-3">
        <Skeleton variant="circular" width={36} height={36} />
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        <Skeleton variant="text" width="100%" />
        <Skeleton variant="text" width="85%" />
      </div>
    </div>
  );
}
