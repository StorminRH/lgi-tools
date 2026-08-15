import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('@/components/ui/toast', () => ({
  toast: { success: toastSuccess },
}));

import { announceSeverOutcome } from './sever-toast';

describe('announceSeverOutcome', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
  });

  it('keys the removed-branch toast and wires Undo', () => {
    const onUndo = vi.fn();
    announceSeverOutcome({
      connectionId: 'c1',
      result: { outcome: 'removed', systemIds: [1, 2, 3] },
      onUndo,
    });

    expect(toastSuccess).toHaveBeenCalledWith(
      'Severed — 3 downstream systems removed',
      expect.objectContaining({
        id: 'sever:c1',
        action: expect.objectContaining({ label: 'Undo' }),
      }),
    );
    const options = toastSuccess.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('singularizes the removed-count copy like the ledger does', () => {
    announceSeverOutcome({
      connectionId: 'c1',
      result: { outcome: 'removed', systemIds: [1] },
      onUndo: vi.fn(),
    });

    expect(toastSuccess).toHaveBeenCalledWith(
      'Severed — 1 downstream system removed',
      expect.objectContaining({ id: 'sever:c1' }),
    );
  });

  it('does not announce an already-applied second Delete', () => {
    announceSeverOutcome({
      connectionId: 'c2',
      result: { outcome: 'already_applied' },
      onUndo: vi.fn(),
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('announces a retained branch without a removed-system count', () => {
    announceSeverOutcome({
      connectionId: 'c2',
      result: { outcome: 'retained' },
      onUndo: vi.fn(),
    });

    expect(toastSuccess).toHaveBeenCalledWith(
      'Severed — branch kept',
      expect.objectContaining({ id: 'sever:c2' }),
    );
  });
});
