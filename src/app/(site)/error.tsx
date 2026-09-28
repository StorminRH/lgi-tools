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
      Something failed unexpectedly. The crash has been logged. You can try the same
      page again, or warp back to the home screen.
    </ErrorPanel>
  );
}
