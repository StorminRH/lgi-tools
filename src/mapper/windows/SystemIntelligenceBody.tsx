'use client';

import { cn } from '@/components/ui/cn';
import { useEntityNames } from '@/components/use-entity-names';
import { systemClassificationReadout } from '@/data/eve-data/system-identity';
import { useSignatureCounts } from '../signatures/signature-context';
import {
  friendlyRows,
  type FriendlyRowModel,
  type PresenceStatusWord,
} from '../tracking/presence-model';
import { useSystemPresence } from '../tracking/presence-context';
import { useSystemLabel } from './use-system-label';

const NO_PILOTS: readonly never[] = [];

function useFriendlyRows(systemId: number): readonly FriendlyRowModel[] {
  const presence = useSystemPresence(systemId);
  const pilots = presence?.pilots ?? NO_PILOTS;
  const names = useEntityNames(pilots.map((pilot) => pilot.characterId));
  return friendlyRows(pilots, names);
}

const STATUS_CLASS: Record<PresenceStatusWord, string> = {
  'In space': 'text-isk',
  Docked: 'text-text',
};

export function SystemTitleAccessory({
  systemId,
}: {
  readonly systemId: number;
}) {
  const label = useSystemLabel(systemId);
  const classification = systemClassificationReadout({
    security: label?.security ?? null,
    whClassId: label?.whClassId ?? null,
  });
  if (classification === null) return null;
  return (
    <span data-identity-readout>
      {' '}
      <span
        data-identity-classification
        className={cn('tabular-nums', classification.tone)}
      >
        {classification.label}
      </span>

    </span>

  );
}

function SignatureSummary({ systemId }: { readonly systemId: number }) {
  const counts = useSignatureCounts(systemId);
  return (
    <section data-intel-section="signatures" className="flex flex-col gap-1">
      <p className="font-data text-label uppercase tracking-label text-isk">
        Scanner
      </p>

      <p className="font-data text-micro text-muted">
        {counts.signatures} signatures · {counts.anomalies} anomalies
      </p>

    </section>

  );
}

function FriendlyRow({ row }: { readonly row: FriendlyRowModel }) {
  return (
    <li
      data-presence-pilot={row.characterId}
      className="flex items-baseline justify-between gap-3"
    >
      <span className="truncate font-data text-ui text-name">{row.label}</span>

      <span
        data-presence-status={row.word}
        className={cn('shrink-0 font-data text-ui', STATUS_CLASS[row.word])}
      >
        {row.word}
      </span>

    </li>

  );
}

function FriendliesSection({ rows }: { readonly rows: readonly FriendlyRowModel[] }) {
  if (rows.length === 0) return null;
  return (
    <section data-intel-section="friendlies" className="flex flex-col gap-1">
      <p className="font-data text-label uppercase tracking-label text-isk">Friendlies</p>

      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <FriendlyRow key={row.characterId} row={row} />
        ))}
      </ul>

    </section>

  );
}

export function SystemIntelligenceBody({ systemId }: { readonly systemId: number }) {
  const rows = useFriendlyRows(systemId);
  return (
    <div data-system-intel className="flex flex-col items-stretch gap-3 text-left">
      <SignatureSummary systemId={systemId} />
      <FriendliesSection rows={rows} />
    </div>

  );
}
