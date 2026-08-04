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
  const duration = input.durationMs ?? 12_000;
  if (input.result.outcome === 'removed') {
    const count = input.result.systemIds.length;
    toast.success(
      `Severed — ${count} downstream system${count === 1 ? '' : 's'} removed`,
      {
        id,
        duration,
        action: {
          label: 'Undo',
          onClick: () => {
            input.onUndo();
          },
        },
      },
    );
    return;
  }
  toast.success('Severed — branch kept', {
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
