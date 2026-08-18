import { expect, it, vi } from 'vitest';

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('@/components/ui/toast', () => ({
  toast: { success: toastSuccess },
}));

import { announceSeverOutcome } from './sever-toast';

it('announces removed and retained sever outcomes, skips already-applied, and wires Undo', () => {
  toastSuccess.mockClear();
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

  toastSuccess.mockClear();
  announceSeverOutcome({
    connectionId: 'c1',
    result: { outcome: 'removed', systemIds: [1] },
    onUndo: vi.fn(),
  });
  expect(toastSuccess).toHaveBeenCalledWith(
    'Severed — 1 downstream system removed',
    expect.objectContaining({ id: 'sever:c1' }),
  );

  toastSuccess.mockClear();
  announceSeverOutcome({
    connectionId: 'c2',
    result: { outcome: 'already_applied' },
    onUndo: vi.fn(),
  });
  expect(toastSuccess).not.toHaveBeenCalled();

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
