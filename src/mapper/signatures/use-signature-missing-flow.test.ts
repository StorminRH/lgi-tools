import { expect, it, vi } from 'vitest';
import type { ScannedRow } from '@/data/maps/scan-parse';
import { listedMissingIds, useSignatureMissingFlow } from './use-signature-missing-flow';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
const h = vi.hoisted(() => ({
  applyScan: vi.fn(),
  applyRows: null as
    | ((systemId: number, rows: readonly ScannedRow[]) => Promise<void>)
    | null,
  invalidate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { error: h.toastError, success: vi.fn() },
}));
vi.mock('@/data/convex/use-mutation', () => ({
  useMutation: () => h.applyScan,
}));
// The test hands scanned rows to the flow directly instead of pasting them.
vi.mock('./use-scanner-paste', () => ({
  applyScannerRows: vi.fn(),
  useScannerPaste: (input: { applyRows: NonNullable<typeof h.applyRows> }) => {
    h.applyRows = input.applyRows;
  },
}));
vi.mock('./signature-elimination-client', () => ({
  followUpElimination: vi.fn(async () => null),
  invalidateSignatureElimination: h.invalidate,
}));

it('highlights missing ids only when the paste target is the listed system', () => {
  const bySystem = new Map<number, ReadonlySet<string>>([
    [1, new Set(['ABC-123'])],
    [2, new Set(['XYZ-999'])],
  ]);
  expect([...listedMissingIds(2, 1, bySystem)]).toEqual([]);
  expect([...listedMissingIds(1, 1, bySystem)]).toEqual(['ABC-123']);
  expect([...listedMissingIds(null, 1, bySystem)]).toEqual([]);
});

it('removes missing rows through the injected authoring and clears them only when the remove lands', async () => {
  rt.unmount();
  h.invalidate.mockClear();
  h.toastError.mockClear();
  h.applyScan.mockResolvedValue({
    inserted: 0,
    updated: 0,
    migrated: 0,
    removedConfident: 0,
    missing: ['ABC-123', 'XYZ-999'],
  });
  const authoring = {
    removeSignatures: vi.fn(async (): Promise<unknown> => undefined),
    restoreSignatures: vi.fn(async (): Promise<unknown> => undefined),
  };
  const input = {
    mapId: 'map-a',
    canEdit: true,
    pasteTarget: { kind: 'ready', systemId: 7, characterId: 101 } as const,
    scannerSystemId: 7,
    onScannerChosen: vi.fn(),
    authoring,
  };
  const row: ScannedRow = {
    signatureId: 'KEP-100',
    kind: 'signature',
    group: null,
    name: null,
    signalPct: null,
  };

  rt.render(useSignatureMissingFlow, input);
  await h.applyRows?.(7, [row]);
  let flow = rt.render(useSignatureMissingFlow, input);
  expect([...flow.missingIds]).toEqual(['ABC-123', 'XYZ-999']);

  // A swallowed failure reports itself and keeps the missing prompt up.
  await flow.removeMissingRows();
  expect(authoring.removeSignatures).toHaveBeenCalledWith({
    mapId: 'map-a',
    systemId: 7,
    signatureIds: ['ABC-123', 'XYZ-999'],
  });
  expect(h.toastError).toHaveBeenCalledWith('Remove failed', {
    id: 'signature-remove:7:ABC-123,XYZ-999',
  });
  expect(h.invalidate).not.toHaveBeenCalled();
  flow = rt.render(useSignatureMissingFlow, input);
  expect([...flow.missingIds]).toEqual(['ABC-123', 'XYZ-999']);

  authoring.removeSignatures.mockResolvedValueOnce({ changed: 2 });
  await flow.removeMissingRows();
  expect(authoring.removeSignatures).toHaveBeenCalledTimes(2);
  expect(h.invalidate).toHaveBeenCalledWith('map-a', 7);
  flow = rt.render(useSignatureMissingFlow, input);
  expect(flow.missingIds.size).toBe(0);
  expect(h.applyScan).toHaveBeenCalledOnce();
});
