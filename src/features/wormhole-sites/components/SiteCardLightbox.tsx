'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { sitesDetailMode } from '@/lib/preferences';
import type { SiteDetail } from '../types';
import { SiteCardHeader } from './SiteCardHeader';
import { SiteDetailsBody } from './SiteDetailsBody';

// Collapse any in-place expansion left over from a live switch out of expand mode.
function collapseDetails(card: Element) {
  const details = card.querySelector<HTMLDetailsElement>('details');
  if (details?.open) details.open = false;
}

// The card's summary element (with its card), or null before either is in the DOM.
function findCardSummary(
  anchor: HTMLElement | null,
): { card: Element; summary: HTMLElement } | null {
  const card = anchor?.closest('[data-site-card]');
  if (!card) return null;
  const summary = card.querySelector<HTMLElement>('details > summary');
  return summary ? { card, summary } : null;
}

/**
 * Lightbox-mode expand for a catalogue site card. Rendered as a sibling of the
 * card's `<details>` (never inside it — a closed `<details>` hides its content
 * subtree, which could hide a dialog rendered within). Reads the `sitesDetailMode`
 * preference: in `expand` mode it renders nothing and the native `<details>` +
 * `LazySiteDetails` own the in-place expansion; in `lightbox` mode it intercepts
 * the summary click (cancelling the native toggle) and opens the full card —
 * header + detail body — centred over the dimmed catalogue.
 *
 * The overlay is the shared Base UI `Dialog` primitive: it owns the scale-in/out,
 * dim, focus trap, scroll lock, and Esc/outside-press dismiss. This island only
 * drives the controlled `open` state and re-points the summary click — no phase
 * machine. `finalFocus={summaryRef}` returns focus to the summary on close (there
 * is no Base UI Trigger to restore to, since the opener is a sibling element).
 */
export function SiteCardLightbox({ site }: { site: SiteDetail }) {
  const [mode] = usePreference(sitesDetailMode);
  const nameId = useId();

  const anchorRef = useRef<HTMLSpanElement>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  // Lightbox mode: a click on the card's summary opens the overlay instead of
  // expanding it in place. preventDefault cancels the native <details> toggle
  // (fires for mouse + keyboard Enter/Space). Also collapse any in-place expand
  // left over from a live switch out of expand mode, and capture the summary as
  // the focus-return target. In expand mode the effect attaches nothing and
  // closes any open overlay, so a later switch back to lightbox starts closed.
  useEffect(() => {
    if (mode !== 'lightbox') {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setOpen(false);
      return;
    }
    const found = findCardSummary(anchorRef.current);
    if (!found) return;
    summaryRef.current = found.summary;
    collapseDetails(found.card);
    const onClick = (e: Event) => {
      e.preventDefault();
      setOpen(true);
    };
    found.summary.addEventListener('click', onClick);
    return () => found.summary.removeEventListener('click', onClick);
  }, [mode]);

  return (
    <span ref={anchorRef} className="contents">
      {mode === 'lightbox' && (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          labelledBy={nameId}
          finalFocus={summaryRef}
          className="sites-lightbox-dialog"
        >
          <div className="sites-lightbox-panel">
            <div className="sticky top-0 z-10 flex justify-end bg-bg px-2 py-1.5">
              <DialogClose
                aria-label="Close"
                className="font-mono text-ui leading-none text-muted hover:text-name px-1.5 py-0.5"
              >
                ×
              </DialogClose>
            </div>
            <div className="sites-lightbox-zoom pb-3">
              <div className="sites-card-summary">
                <SiteCardHeader site={site} nameId={nameId} />
              </div>
              <SiteDetailsBody site={site} />
            </div>
          </div>
        </Dialog>
      )}
    </span>
  );
}
