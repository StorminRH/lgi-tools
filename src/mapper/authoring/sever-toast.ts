import { toast } from '@/components/ui/toast';

/** Result shape returned by the sever mutation after a successful write. */
export type SeverOutcome =
  | { readonly outcome: 'retained' }
  | { readonly outcome: 'removed'; readonly systemIds: readonly number[] };

/**
 * Announces one sever outcome with a keyed Undo action. The toast is a
 * convenience; the map-event ledger remains the durable restore surface.
 */
export function announceSeverOutcome(input: {
  readonly connectionId: string;
  readonly result: SeverOutcome;
  readonly onUndo: () => void;
  readonly durationMs?: number;
}): void {
  const id = `sever:${input.connectionId}`;
  const duration = input.durationMs ?? 3_000;
  const message =
    input.result.outcome === 'removed'
      ? severedRemovedMessage(input.result.systemIds.length)
      : 'Severed — branch kept';
  toast.success(message, {
    id,
    duration,
    action: {
      label: 'Undo',
      onClick: () => {
        input.onUndo();
      },
    },
  });
}

// Pluralization mirrors the ledger copy in `map-event-copy.ts`.
function severedRemovedMessage(count: number): string {
  return `Severed — ${count} downstream system${count === 1 ? '' : 's'} removed`;
}
