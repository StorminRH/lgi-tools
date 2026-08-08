import { describe, expect, it, vi } from 'vitest';
import { announceSignatureRemoval } from './signature-toast';

const success = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/toast', () => ({ toast: { success } }));

describe('signature removal toast', () => {
  it('keys the message and exposes the supplied Undo action', () => {
    const onUndo = vi.fn();
    announceSignatureRemoval({
      systemId: 7,
      signatureIds: ['ABC-123'],
      onUndo,
    });
    expect(success).toHaveBeenCalledWith(
      'Removed 1 signature',
      expect.objectContaining({
        id: 'signature-remove:7:ABC-123',
        action: expect.objectContaining({ label: 'Undo' }),
      }),
    );
    const options = success.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
