'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FeedbackModal } from '@/features/feedback/components/FeedbackModal';
import { useAuth } from '@/platform/auth/components/AuthProvider';

/**
 * Floating feedback affordance. Fixed to the bottom-right corner so it's
 * reachable at any scroll position. Click opens the feedback modal in
 * place; submissions POST to /api/feedback which forwards to a Discord
 * webhook and logs to usage_logs.
 *
 * Reads login state here (the shared component layer may import the auth
 * feature) and feeds it to the modal as props, so the feedback feature stays
 * decoupled from the auth feature.
 *
 * `compact` selects the map's icon-only form; it defaults to the labelled
 * button every site route uses.
 */
export function FeedbackButton({
  compact = false,
  embedded = false,
}: {
  compact?: boolean;
  /** Lets a route-owned chrome cluster own geometry without changing site placement. */
  embedded?: boolean;
}) {
  const { session, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        size={compact ? 'sm' : 'md'}
        aria-label={compact ? 'Send feedback' : undefined}
        onClick={() => setOpen(true)}
        className={embedded ? undefined : 'fixed bottom-4 right-4 z-dropdown'}
        data-map-feedback-chip={embedded || undefined}
        data-site-feedback={embedded ? undefined : ''}
      >
        {compact ? '?' : 'Feedback'}
      </Button>
      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        session={session}
        loading={loading}
      />
    </>
  );
}
