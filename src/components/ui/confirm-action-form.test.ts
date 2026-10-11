import { afterEach, expect, it, vi } from 'vitest';
import { ActionForm } from './action-form';
import { ConfirmActionForm } from './confirm-action-form';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('asks before posting and cancels the post only when the question is declined', () => {
  const confirm = vi.fn(() => false);
  vi.stubGlobal('window', { confirm });
  const form = ConfirmActionForm({
    action: '/api/admin/sessions/revoke',
    fields: { userId: 'user-1' },
    confirm: 'Revoke all sessions for Pilot?',
    children: 'Force logout',
  });
  expect(form.type).toBe(ActionForm);
  expect(form.props).toMatchObject({ action: '/api/admin/sessions/revoke', fields: { userId: 'user-1' } });
  const { onSubmit } = form.props as { onSubmit: (event: { preventDefault: () => void }) => void };

  const declined = { preventDefault: vi.fn() };
  onSubmit(declined);
  expect(confirm).toHaveBeenCalledWith('Revoke all sessions for Pilot?');
  expect(declined.preventDefault).toHaveBeenCalledOnce();

  confirm.mockReturnValue(true);
  const accepted = { preventDefault: vi.fn() };
  onSubmit(accepted);
  expect(accepted.preventDefault).not.toHaveBeenCalled();
});
