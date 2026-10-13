'use client';

import { ErrorPanel } from '@/components/composition/ErrorPanel';

export default function Error(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel
      source="error.tsx"
      error={props.error}
      onRetry={() => props.retry()}
      eyebrow="500 · Containment breach"
      title="Pod malfunction"
    >
      This page couldn’t load.
    </ErrorPanel>
  );
}
