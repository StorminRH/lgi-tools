'use client';

import { useState } from 'react';
import { Pill } from '@/components/ui/pill';
import { FeedbackModal } from '@/features/feedback/components/FeedbackModal';
import type { Session } from '@/features/auth/types';

// Floating feedback affordance. Fixed to the bottom-right corner so it's
// reachable at any scroll position. Click opens the feedback modal in
// place; submissions POST to /api/feedback which forwards to a Discord
// webhook and logs to usage_logs.
export function FeedbackButton({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 inline-flex shadow-lg hover:opacity-90 transition-opacity"
      >
        <Pill tone="green">Feedback</Pill>
      </button>
      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        session={session}
      />
    </>
  );
}
