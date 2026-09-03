'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';

export function AdminForceLogoutForm({
  userId,
  userName,
  disabled,
}: {
  userId: string;
  userName: string;
  disabled?: boolean;
}) {
  const disabledReasonId = useId();

  return (
    <form
      method="POST"
      action="/api/admin/sessions/revoke"
      onSubmit={(e) => {
        if (!window.confirm(`Revoke all sessions for ${userName}? They'll have to sign in again.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-describedby={disabled ? disabledReasonId : undefined}
        title={disabled ? 'Use the normal sign-out for your own session' : undefined}
        className="whitespace-nowrap"
      >
        Force logout
      </Button>

      <span id={disabledReasonId} className="sr-only">
        Use the normal sign-out for your own session.
      </span>

    </form>

  );
}
