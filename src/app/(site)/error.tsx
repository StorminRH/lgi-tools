'use client';

import { ErrorPanel } from '@/components/composition/ErrorPanel';

export default function Error(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorPanel
      source="error.tsx"
      error={props.error}
      onRetry={() => props.unstable_retry()}
      eyebrow="500 · Containment breach"
      title="Pod malfunction"
    >
      This page couldn’t load.
    </ErrorPanel>
  );
}
