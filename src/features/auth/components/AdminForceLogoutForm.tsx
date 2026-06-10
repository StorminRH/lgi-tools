'use client';

// Admin force-logout control — revokes all of a user's sessions. Pure HTML form
// with a confirm() gate (bundled client JS — CSP-safe). `disabled` is set on the
// admin's own row (you sign yourself out the normal way). The route is the real
// guard.
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
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? 'Use the normal sign-out for your own session' : undefined}
        className="font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-muted hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-idle whitespace-nowrap"
      >
        Force logout
      </button>
    </form>
  );
}
