import { expect, test, vi } from 'vitest';
import { fakeQuerySelector, keyDown, type FakeElement } from './__tests__/fake-page';

// The effect runs as the hook calls it and leaves its cleanup for the test.
const h = vi.hoisted(() => ({ cleanup: undefined as void | (() => void) }));
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => {
    h.cleanup = effect();
  },
}));

import { isPopupOpen, useEscapeDismiss } from './popup-open';

test('a Base UI dialog, listbox or menu counts as open while it carries data-open, and nothing is open without a document', () => {
  expect(isPopupOpen()).toBe(false);

  const page: FakeElement[] = [];
  vi.stubGlobal('document', { querySelector: fakeQuerySelector(page) });
  try {
    // An open collapsible is not a popup.
    page.push({ attributes: { 'data-open': '' } });
    expect(isPopupOpen()).toBe(false);

    // A dialog still mounted for its exit animation has already lost data-open.
    page.push({ attributes: { role: 'dialog', 'data-closed': '' } });
    expect(isPopupOpen()).toBe(false);

    // A drawer is a dialog to Base UI, so it needs no marker of its own.
    page.push({ attributes: { role: 'dialog', 'data-open': '', 'data-drawer-popup': '' } });
    expect(isPopupOpen()).toBe(true);

    for (const role of ['dialog', 'listbox', 'menu']) {
      page.length = 0;
      page.push({ attributes: { role, 'data-open': '' } });
      expect(isPopupOpen()).toBe(true);

      // A select or combobox list sits inside the open positioner.
      const positioner = { attributes: { 'data-open': '' } };
      page.length = 0;
      page.push(positioner, { attributes: { role }, parent: positioner });
      expect(isPopupOpen()).toBe(true);
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

test('Escape dismisses unless a listener already took it or a popup is open; other keys, a disabled hook and an unmounted one do nothing', () => {
  const page: FakeElement[] = [];
  const document = Object.assign(new EventTarget(), { querySelector: fakeQuerySelector(page) });
  const window = new EventTarget();
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  const onDismiss = vi.fn();
  try {
    useEscapeDismiss(onDismiss);
    window.dispatchEvent(keyDown('Escape'));
    document.dispatchEvent(keyDown('Enter'));
    expect(onDismiss).not.toHaveBeenCalled();
    document.dispatchEvent(keyDown('Escape'));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // An open menu owns Escape even while its own listener has yet to run.
    page.push({ attributes: { role: 'menu', 'data-open': '' } });
    document.dispatchEvent(keyDown('Escape'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    page.length = 0;

    h.cleanup?.();
    document.dispatchEvent(keyDown('Escape'));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    useEscapeDismiss(onDismiss, { enabled: false });
    expect(h.cleanup).toBeUndefined();
    document.dispatchEvent(keyDown('Escape'));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // A listener that ran first and took the key (Base UI calls preventDefault
    // on the Escape that closes its popup) leaves the surface open.
    document.addEventListener('keydown', (event) => event.preventDefault());
    useEscapeDismiss(onDismiss);
    const taken = keyDown('Escape');
    document.dispatchEvent(taken);
    expect(taken.defaultPrevented).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    h.cleanup?.();

    // A window listener hears the key once it has bubbled past the document.
    useEscapeDismiss(onDismiss, { target: 'window' });
    window.dispatchEvent(keyDown('Escape'));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  } finally {
    h.cleanup?.();
    vi.unstubAllGlobals();
  }
});
