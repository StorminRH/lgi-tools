'use client';

import { ErrorPanel } from '@/components/composition/ErrorPanel';

export default function AtlasError(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorPanel
      source="atlas/error.tsx"
      error={props.error}
      onRetry={() => props.unstable_retry()}
      eyebrow="Atlas signal lost"
      title="Map unavailable"
    />
  );
}
