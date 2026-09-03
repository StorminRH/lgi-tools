'use client';

import { useCallback, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { cn } from '@/components/ui/cn';
import { scrollAreaStart } from '@/components/ui/scroll-area';
import type { OriginLeadConnection } from '../authoring/leads-to-origin';
import { mapFrostedSurface } from '../map-frosted-surface';
import { MapWindow } from '../windows/MapWindow';
import { ScannerSections } from './scanner-section-table';
import {
  ScannerScrollEpochProvider,
  useScannerScrollBump,
} from './scanner-scroll-dismiss';
import type { WormholeCellContext } from './scanner-wormhole-cells';
import {
  groupSignatureSections,
  type SignatureWindowRow,
} from './signature-model';

function ScannerPasteHint() {
  return (
    <section
      data-scanner-paste-hint
      className={cn(mapFrostedSurface, 'min-w-0 max-w-full')}
    >
      <h3 className="px-2.5 py-1.5 text-center font-ui text-label font-semibold text-isk">
        Paste signatures anywhere on the page.
      </h3>

    </section>

  );
}

function ScannerListScroller({
  children,
}: {
  readonly children: ReactNode;
}) {
  const bump = useScannerScrollBump();
  const observerRef = useRef<ResizeObserver | null>(null);
  const [fading, setFading] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);
  const measure = useCallback((el: HTMLDivElement) => {
    const nextFade = el.scrollTop > 0;
    const nextCanScrollEnd =
      el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setFading((current) => (current === nextFade ? current : nextFade));
    setCanScrollEnd((current) =>
      current === nextCanScrollEnd ? current : nextCanScrollEnd,
    );
  }, []);
  const setScrollNode = useCallback(
    (el: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (el === null) return;
      const update = () => measure(el);
      update();
      const observer = new ResizeObserver(update);
      observer.observe(el);
      const inner = el.firstElementChild;
      if (inner !== null) observer.observe(inner);
      observerRef.current = observer;
    },
    [measure],
  );
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    bump();
    measure(event.currentTarget);
  };
  return (
    <div className="relative flex min-h-0 flex-auto flex-col">
      <div
        ref={setScrollNode}
        data-scanner-scroll
        onScroll={onScroll}
        className={cn(
          scrollAreaStart,
          'min-h-0 min-w-0 max-w-full flex-auto overflow-y-auto overscroll-contain',
          canScrollEnd && 'scanner-scroll-fade-end',
          fading && 'scanner-scroll-fade-start',
        )}
      >
        <div className="min-w-0 w-full max-w-full">{children}</div>

      </div>

      <div
        aria-hidden
        data-scanner-scroll-frost="start"
        className={cn(
          'scanner-scroll-frost scanner-scroll-frost-start',
          fading && 'is-active',
        )}
      />
      <div
        aria-hidden
        data-scanner-scroll-frost="end"
        className={cn(
          'scanner-scroll-frost scanner-scroll-frost-end',
          canScrollEnd && 'is-active',
        )}
      />
    </div>

  );
}

export function ScannerWindowFrame({
  scannerSystemId,
  rows,
  missingIds,
  canEdit,
  complete,
  now,
  bindConnectionSetters,
  originLeadConnections,
  onIdentify,
  resolveSiteId,
  onOpenActions,
}: {
  readonly scannerSystemId: number | null;
  readonly rows: readonly SignatureWindowRow[];
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly complete: boolean;
  readonly now: number;
  readonly bindConnectionSetters?: WormholeCellContext['bindConnectionSetters'];
  readonly originLeadConnections?: readonly OriginLeadConnection[];
  readonly onIdentify?: WormholeCellContext['onIdentify'];
  readonly resolveSiteId: (name: string) => number | null;
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  const sections = groupSignatureSections(rows, scannerSystemId);
  const filled = sections.length > 0;
  const listOpen = filled || !complete;
  return (
    <ScannerScrollEpochProvider>
      <MapWindow
        windowId="signatures"
        title="Signatures · Anomalies"
        placement={{ kind: 'docked-bottom-left' }}
        stackIndex={1}
        showHeader
        showCloseButton={false}
        onClose={() => undefined}
        onActivate={() => undefined}
      >
        <div
          data-signature-window
          data-scanner-filled={filled ? 'true' : 'false'}
          className="flex min-h-0 min-w-0 flex-auto flex-col px-2 pb-1.5 pt-1"
        >
          {!filled && complete && canEdit ? (
            <ScannerPasteHint />
          ) : null}
          {listOpen ? (
            <ScannerListScroller>
              <ScannerSections
                sections={sections}
                scannerSystemId={scannerSystemId}
                missingIds={missingIds}
                canEdit={canEdit}
                resolveSiteId={resolveSiteId}
                complete={complete}
                now={now}
                bindConnectionSetters={bindConnectionSetters}
                originLeadConnections={originLeadConnections ?? []}
                onIdentify={onIdentify}
                onOpenActions={onOpenActions}
              />
            </ScannerListScroller>

          ) : null}
        </div>

      </MapWindow>

    </ScannerScrollEpochProvider>

  );
}
