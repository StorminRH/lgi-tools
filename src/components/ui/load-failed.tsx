'use client';

import { Banner } from './banner';

/**
 * A read that failed every automatic retry: what did not load and what that
 * leaves. Clicking anywhere on it tries again.
 */
export function LoadFailed({
  title,
  detail,
  retryLabel,
  onRetry,
  className,
}: {
  title: string;
  detail?: string;
  retryLabel: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Banner tone="warn" onRetry={onRetry} retryLabel={retryLabel} className={className}>
      <span className="flex flex-col gap-0.5 leading-snug">
        <strong className="font-medium text-name">{title}</strong>
        {detail && <span className="text-muted">{detail}</span>}
      </span>
    </Banner>
  );
}
