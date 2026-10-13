import { expect, it, vi } from 'vitest';
import { removeSignaturesWithUndo } from './signature-removal';

const h = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: h.success, error: h.error },
}));
vi.mock('./signature-elimination-client', () => ({
  invalidateSignatureElimination: h.invalidate,
}));

function mutations() {
  return {
    removeSignatures: vi.fn(async (): Promise<unknown> => ({ changed: 1 })),
    restoreSignatures: vi.fn(async (): Promise<unknown> => ({ changed: 1 })),
  };
}

function pressUndo(): void {
  const options = h.success.mock.calls.at(-1)?.[1] as {
    action: { onClick: () => void };
  };
  options.action.onClick();
}

it('removes, invalidates and offers an Undo that restores and invalidates again', async () => {
  h.success.mockClear();
  h.error.mockClear();
  h.invalidate.mockClear();
  const api = mutations();
  const onRemoved = vi.fn(() => {
    expect(h.invalidate).toHaveBeenCalledOnce();
    expect(h.success).not.toHaveBeenCalled();
  });

  await expect(removeSignaturesWithUndo({
    mapId: 'map-a',
    systemId: 7,
    signatureIds: ['ABC-123', 'XYZ-999'],
    mutations: api,
    onRemoved,
  })).resolves.toBe(true);

  expect(api.removeSignatures).toHaveBeenCalledWith({
    mapId: 'map-a',
    systemId: 7,
    signatureIds: ['ABC-123', 'XYZ-999'],
  });
  expect(h.invalidate).toHaveBeenCalledWith('map-a', 7);
  expect(onRemoved).toHaveBeenCalledOnce();
  expect(h.success).toHaveBeenCalledWith(
    'Signatures removed',
    expect.objectContaining({
      id: 'signature-remove:7:ABC-123,XYZ-999',
      action: expect.objectContaining({ label: 'Undo' }),
    }),
  );
  expect(api.restoreSignatures).not.toHaveBeenCalled();

  h.invalidate.mockClear();
  pressUndo();
  await vi.waitFor(() => expect(h.invalidate).toHaveBeenCalledWith('map-a', 7));
  expect(api.restoreSignatures).toHaveBeenCalledWith({
    mapId: 'map-a',
    systemId: 7,
    signatureIds: ['ABC-123', 'XYZ-999'],
  });
  expect(h.error).not.toHaveBeenCalled();
});

it('toasts a swallowed restore failure from Undo and keeps the elimination digest', async () => {
  h.success.mockClear();
  h.error.mockClear();
  const api = mutations();
  api.restoreSignatures.mockResolvedValueOnce(undefined);
  await removeSignaturesWithUndo({
    mapId: 'map-a',
    systemId: 7,
    signatureIds: ['ABC-123'],
    mutations: api,
  });
  expect(h.success).toHaveBeenCalledWith(
    'Signature removed',
    expect.objectContaining({ id: 'signature-remove:7:ABC-123' }),
  );

  h.invalidate.mockClear();
  pressUndo();
  await vi.waitFor(() =>
    expect(h.error).toHaveBeenCalledWith('Restore failed', {
      id: 'signature-restore:7:ABC-123',
    }),
  );
  expect(api.restoreSignatures).toHaveBeenCalledOnce();
  expect(h.invalidate).not.toHaveBeenCalled();
});

it('reports a swallowed remove failure without invalidating, announcing or calling onRemoved', async () => {
  h.success.mockClear();
  h.error.mockClear();
  h.invalidate.mockClear();
  const api = mutations();
  api.removeSignatures.mockResolvedValueOnce(undefined);
  const onRemoved = vi.fn();

  await expect(removeSignaturesWithUndo({
    mapId: 'map-a',
    systemId: 7,
    signatureIds: ['ABC-123', 'XYZ-999'],
    mutations: api,
    onRemoved,
  })).resolves.toBe(false);

  expect(h.error).toHaveBeenCalledWith('Remove failed', {
    id: 'signature-remove:7:ABC-123,XYZ-999',
  });
  expect(h.invalidate).not.toHaveBeenCalled();
  expect(onRemoved).not.toHaveBeenCalled();
  expect(h.success).not.toHaveBeenCalled();

  h.error.mockClear();
  await expect(removeSignaturesWithUndo({
    mapId: 'map-a',
    systemId: 7,
    signatureIds: [],
    mutations: api,
    onRemoved,
  })).resolves.toBe(false);
  expect(api.removeSignatures).toHaveBeenCalledOnce();
  expect(h.error).not.toHaveBeenCalled();
  expect(onRemoved).not.toHaveBeenCalled();
});
