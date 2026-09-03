import { toast } from '@/components/ui/toast';

export type SeverOutcome =
  | { readonly outcome: 'retained' }
  | { readonly outcome: 'already_applied' }
  | { readonly outcome: 'removed'; readonly systemIds: readonly number[] };

export function announceSeverOutcome(input: {
  readonly connectionId: string;
  readonly result: SeverOutcome;
  readonly onUndo: () => void;
  readonly durationMs?: number;
}): void {
  if (input.result.outcome === 'already_applied') return;
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

function severedRemovedMessage(count: number): string {
  return `Severed — ${count} downstream system${count === 1 ? '' : 's'} removed`;
}
