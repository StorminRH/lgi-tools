'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { mapFrostedSurface } from '../map-frosted-surface';
import {
  formatEventTime,
  mapEventConnectionId,
  mapEventLabel,
  mapEventRestorable,
  type MapEventRow,
} from './map-event-copy';

/** Props for the mapper-local bottom-edge despawn ledger. */
export interface MapEventLogProps {
  readonly events: readonly MapEventRow[];
  readonly canEdit: boolean;
  readonly now: number;
  readonly onRestore: (connectionId: string) => void;
}

/**
 * Bottom-edge audit-log surface: Collapsible-composed newest-first ledger with
 * canEdit-gated Restore on in-window removal rows. Mapper-local until a second
 * consumer justifies promotion to `src/components/ui/`.
 */
export function MapEventLog({
  events,
  canEdit,
  now,
  onRestore,
}: MapEventLogProps) {
  return (
    <div
      data-map-event-log
      // left-4 matches MapChrome / docked Current System so the left rail lines up.
      className="pointer-events-none absolute bottom-2 left-4 z-sticky flex justify-start"
    >
      <div
        className={cn(
          'pointer-events-auto w-full max-w-md rounded-card text-ui',
          mapFrostedSurface,
        )}
      >
        <Collapsible
          defaultOpen={false}
          className="border-0"
          headerClassName="px-2.5 py-1.5"
          header={
            <span className="flex w-full items-center gap-2">
              <span
                data-map-event-log-toggle
                className="text-label uppercase tracking-label text-muted"
              >
                Audit Log
              </span>
              <span
                data-map-event-log-count
                className="font-data text-micro text-muted"
              >
                Events - {events.length}
              </span>
              <span
                data-chevron
                aria-hidden
                className="ml-auto inline-block shrink-0 text-micro text-muted transition-transform"
              >
                ▾
              </span>
            </span>
          }
        >
          {/* Focusable so keyboard-only viewers (no Restore buttons rendered)
              can still scroll the bounded region with the arrow keys. */}
          <div
            data-map-event-log-rows
            tabIndex={0}
            role="group"
            aria-label="Map events"
            className="flex max-h-48 flex-col gap-1 overflow-y-auto border-t border-border-soft px-2.5 py-1.5"
          >
            {events.length === 0 ? (
              <p
                data-map-event-log-empty
                className="font-data text-micro text-muted"
              >
                No map events yet.
              </p>
            ) : (
              events.map((event) => (
                <EventRow
                  key={event._id}
                  event={event}
                  canEdit={canEdit}
                  now={now}
                  onRestore={onRestore}
                />
              ))
            )}
          </div>
        </Collapsible>
      </div>
    </div>
  );
}

function EventRow({
  event,
  canEdit,
  now,
  onRestore,
}: {
  readonly event: MapEventRow;
  readonly canEdit: boolean;
  readonly now: number;
  readonly onRestore: (connectionId: string) => void;
}) {
  const restorable = canEdit && mapEventRestorable(event, now);
  return (
    <div
      data-map-event-row
      data-map-event-kind={event.kind}
      className="flex items-start gap-2 font-data text-micro"
    >
      <div className="min-w-0 flex-1">
        <div className="text-muted">{formatEventTime(event.at)}</div>
        <div className="text-name">
          <span className="text-isk">{event.actor}</span>
          {' · '}
          {mapEventLabel(event)}
        </div>
      </div>
      {restorable ? (
        <Button
          variant="ghost"
          size="sm"
          data-map-event-restore
          className="shrink-0 px-1.5 py-0.5 text-micro"
          onClick={() => onRestore(mapEventConnectionId(event))}
        >
          Restore
        </Button>
      ) : null}
    </div>
  );
}
