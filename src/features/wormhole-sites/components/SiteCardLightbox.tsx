'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { sitesDetailMode } from '@/lib/preferences';
import type { SiteDetail } from '../types';
import { SiteCardHeader } from './SiteCardHeader';
import { SiteDetailsBody } from './SiteDetailsBody';

function collapseDetails(card: Element) {
  const details = card.querySelector<HTMLDetailsElement>('details');
  if (details?.open) details.open = false;
}

function findCardSummary(
  anchor: HTMLElement | null,
): { card: Element; summary: HTMLElement } | null {
  const card = anchor?.closest('[data-site-card]');
  if (!card) return null;
  const summary = card.querySelector<HTMLElement>('details > summary');
  return summary ? { card, summary } : null;
}

export function SiteCardLightbox({ site }: { site: SiteDetail }) {
  const [mode] = usePreference(sitesDetailMode);
  const nameId = useId();

  const anchorRef = useRef<HTMLSpanElement>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

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
            <div className="sticky top-0 z-sticky flex justify-end bg-bg px-2 py-1.5">
              <DialogClose
                aria-label="Close"
                className="text-ui leading-none text-muted hover:text-name px-1.5 py-0.5"
              >
                ×
              </DialogClose>
            </div>
            <div className="sites-lightbox-zoom pb-3">
              <div className="flex flex-col gap-2 px-[17px] pb-[13px] pt-[15px]">
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
