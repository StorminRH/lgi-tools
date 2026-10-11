import { ConfirmActionForm } from '@/components/ui/confirm-action-form';

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
    <ConfirmActionForm
      action="/api/admin/sessions/revoke"
      fields={{ userId }}
      confirm={`Revoke all sessions for ${userName}? They'll have to sign in again.`}
      disabled={disabled}
      disabledReason="Use the normal sign-out for your own session."
      className="whitespace-nowrap"
    >
      Force logout
    </ConfirmActionForm>
  );
}
