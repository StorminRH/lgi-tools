'use client';

import { useEffect } from 'react';

// Base UI marks an open dialog, drawer, select, combobox or menu with
// data-open, on the popup itself or on the popup or positioner around its
// list, and drops it the moment closing starts, so a popup playing its exit
// animation no longer counts as open.
const OPEN_POPUP_SELECTOR = [
  '[data-open][role="dialog"]',
  '[data-open][role="listbox"]',
  '[data-open][role="menu"]',
  '[data-open] [role="dialog"]',
  '[data-open] [role="listbox"]',
  '[data-open] [role="menu"]',
].join(',');

/** Whether a Base UI popup is open anywhere on the page; false where there is no document. */
export function isPopupOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(OPEN_POPUP_SELECTOR) !== null;
}

/**
 * Escape dismisses a surface unless something else owns the key: a handler
 * that already took it (Base UI calls preventDefault on the Escape that closes
 * its popup) or an open popup, which closes first while the surface stays.
 *
 * The listener sits on `document` unless `target` is `'window'`. A window
 * listener hears the key after every document listener, Base UI's included.
 * `enabled: false` registers nothing.
 */
export function useEscapeDismiss(
  onDismiss: () => void,
  { enabled = true, target = 'document' }: {
    readonly enabled?: boolean;
    readonly target?: 'document' | 'window';
  } = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    const host: GlobalEventHandlers = target === 'window' ? window : document;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isPopupOpen()) return;
      onDismiss();
    };
    host.addEventListener('keydown', onKeyDown);
    return () => host.removeEventListener('keydown', onKeyDown);
  }, [enabled, onDismiss, target]);
}
