'use client';

import { Button } from '@/components/ui/button';

/**
 * Admin force-logout control — revokes all of a user's sessions. Pure HTML form
 * with a confirm() gate (bundled client JS — CSP-safe). `disabled` is set on the
 * admin's own row (you sign yourself out the normal way). The route is the real
 * guard.
 */
export function AdminForceLogoutForm({
  userId,
  userName,
  disabled,
}: {
  userId: string;
  userName: string;
  disabled?: boolean;
}) {
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
        title={disabled ? 'Use the normal sign-out for your own session' : undefined}
        className="whitespace-nowrap"
      >
        Force logout
      </Button>
    </form>
  );
}
