import type * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PasteTarget } from '../tracking/tracked-system';
import { useScannerPaste, type PendingScannerPaste } from './use-scanner-paste';

const effects = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useEffect: (effect: () => (() => void)) => {
    effects.cleanup?.();
    effects.cleanup = effect();
  },
}));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('../windows/MapWindow', () => ({ isAdoptedPopupOpen: () => false }));

const candidates = [
  { characterId: 7, systemId: 1, lastMovementAt: 100 },
  { characterId: 8, systemId: 2, lastMovementAt: 200 },
];

function scan(signatureId: string): string {
  return `${signatureId}\tCosmic Signature\tWormhole\tUnstable Wormhole\t100%\t1 AU`;
}

function ScannerPasteHarness(props: Parameters<typeof useScannerPaste>[0]) {
  useScannerPaste(props);
  return null;
}

describe('scanner paste replacement', () => {
  let documentEvents: EventTarget;
  const applyRows = vi.fn(async () => undefined);
  const onPendingPasteChange = vi.fn<(pending: PendingScannerPaste | null) => void>();

  function listen(pasteTarget: PasteTarget, canEdit = true): void {
    renderToStaticMarkup(createElement(ScannerPasteHarness, {
      pasteTarget, canEdit, applyRows, onPendingPasteChange,
    }));
  }

  function paste(text: string): void {
    const event = new Event('paste', { cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => text },
    });
    documentEvents.dispatchEvent(event);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    documentEvents = new EventTarget();
    vi.stubGlobal('document', documentEvents);
    listen({ kind: 'choose', candidates });
    paste(scan('OLD-001'));
    expect(onPendingPasteChange).toHaveBeenLastCalledWith({
      candidates,
      rows: [expect.objectContaining({ signatureId: 'OLD-001' })],
    });
    expect(applyRows).not.toHaveBeenCalled();
  });

  afterEach(() => {
    effects.cleanup?.();
    effects.cleanup = undefined;
    vi.unstubAllGlobals();
  });

  it('clears the older choice before applying a newer unambiguous scan', () => {
    listen({ kind: 'ready', characterId: 7, systemId: 1 });
    paste(scan('NEW-002'));
    expect(onPendingPasteChange).toHaveBeenLastCalledWith(null);
    expect(applyRows).toHaveBeenCalledExactlyOnceWith(
      1,
      [expect.objectContaining({ signatureId: 'NEW-002' })],
    );
    expect(onPendingPasteChange.mock.invocationCallOrder.at(-1))
      .toBeLessThan(applyRows.mock.invocationCallOrder[0]!);
  });

  it('clears the older choice when a newly recognized scan is refused', () => {
    listen({ kind: 'none' });
    paste(scan('NEW-002'));
    expect(onPendingPasteChange).toHaveBeenLastCalledWith(null);
    expect(applyRows).not.toHaveBeenCalled();
  });

  it('replaces a pending choice with the newest ambiguous scan', () => {
    paste(scan('NEW-002'));
    expect(onPendingPasteChange).toHaveBeenLastCalledWith({
      candidates,
      rows: [expect.objectContaining({ signatureId: 'NEW-002' })],
    });
    expect(applyRows).not.toHaveBeenCalled();
  });

  it('preserves the pending choice when the clipboard contains unrelated text', () => {
    paste('ordinary clipboard text');
    expect(onPendingPasteChange).toHaveBeenCalledTimes(1);
    expect(applyRows).not.toHaveBeenCalled();
  });
});
