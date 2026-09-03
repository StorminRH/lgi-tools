'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FeedbackModal } from '@/features/feedback/components/FeedbackModal';
import { useAuth } from '@/platform/auth/components/AuthProvider';

export function FeedbackButton({
  compact = false,
  embedded = false,
}: {
  compact?: boolean;
  embedded?: boolean;
}) {
  const { session, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button
        variant="primary"
        size={compact ? 'sm' : 'md'}
        aria-label={compact ? 'Send feedback' : undefined}
        onClick={() => {
          setFormKey((key) => key + 1);
          setOpen(true);
        }}
        className={embedded ? undefined : 'fixed bottom-4 right-4 z-dropdown'}
        data-map-feedback-chip={embedded || undefined}
        data-site-feedback={embedded ? undefined : ''}
      >
        {compact ? '?' : 'Feedback'}
      </Button>
      <FeedbackModal
        key={formKey}
        open={open}
        onClose={() => setOpen(false)}
        session={session}
        loading={loading}
      />
    </>
  );
}
