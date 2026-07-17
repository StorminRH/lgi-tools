'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FeedbackModal } from '@/features/feedback/components/FeedbackModal';
import { useAuth } from '@/features/auth/components/AuthProvider';

/**
 * Floating feedback affordance. Fixed to the bottom-right corner so it's
 * reachable at any scroll position. Click opens the feedback modal in
 * place; submissions POST to /api/feedback which forwards to a Discord
 * webhook and logs to usage_logs.
 *
 * Reads login state here (the shared component layer may import the auth
 * feature) and feeds it to the modal as props, so the feedback feature stays
 * decoupled from the auth feature.
 */
export function FeedbackButton() {
  const { session, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-dropdown"
      >
        Feedback
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
