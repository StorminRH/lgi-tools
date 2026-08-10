'use client';

// The system intelligence body shared by the node summary card and the
// click-through dock (which is pointer-inert — everything here stays
// non-interactive text). Operator-directed shape (4.0.4.3.2 D-E): one
// identity readout up top — `Name - 0.7` / `J123456 - C4` in its identity
// tone, through the same shared rule the canvas nodes render — then a minimal
// two-column friendlies readout: pilot name left, one single-word status
// right, nothing more. Sections are keyed (`data-intel-section`) so future
// widget readouts (gas, anomalies) append as sibling sections without
// restructuring.
//
// Identity facts come from the same node data the canvas renders
// (equality-stable store selectors, never the hot nodes array — the 4.0.3.3
// window-layer rule); presence comes from the shared context; pilot names
// resolve through the shared /api/eve/names hook, with row assembly in the
// tested presence model.
import { cn } from '@/components/ui/cn';
import { useEntityNames } from '@/components/use-entity-names';
import { systemIdentityReadout } from '@/data/eve-data/system-identity';
import { useSignatureCounts } from '../signatures/signature-context';
import {
  friendlyRows,
  type FriendlyRowModel,
  type PresenceStatusWord,
} from '../tracking/presence-model';
import { useSystemPresence } from '../tracking/presence-context';
import { useNodeDataNumber, useNodeDataString } from './node-fields';

const NO_PILOTS: readonly never[] = [];

/** This system's friendlies rows, names resolved and statuses derived. */
function useFriendlyRows(systemId: number): readonly FriendlyRowModel[] {
  const presence = useSystemPresence(systemId);
  const pilots = presence?.pilots ?? NO_PILOTS;
  const names = useEntityNames(pilots.map((pilot) => pilot.characterId));
  return friendlyRows(pilots, names);
}

const STATUS_CLASS: Record<PresenceStatusWord, string> = {
  'In space': 'text-isk',
  Docked: 'text-text',
  AFK: 'text-tone-orange',
  Stale: 'text-muted',
};

function IntelligenceHeader({ systemId }: { readonly systemId: number }) {
  const name = useNodeDataString(systemId, 'name');
  const security = useNodeDataNumber(systemId, 'security');
  const whClassId = useNodeDataNumber(systemId, 'whClassId');
  // The one identity rule (D-E): the readout already carries the rounded
  // security or the class, so no separate Security Status row survives it.
  const readout = systemIdentityReadout({
    name: name ?? String(systemId),
    security,
    whClassId,
  });
  return (
    <section data-intel-section="summary" className="flex flex-col gap-1">
      <div data-intel-identity className="flex items-baseline gap-2">
        <span
          data-identity-readout
          className={cn('font-data text-ui tabular-nums', readout.tone)}
        >
          {readout.label}
        </span>
      </div>
    </section>
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

/** Shared body for the dock and node summary — one identity readout, scanner counts, friendlies. */
export function SystemIntelligenceBody({ systemId }: { readonly systemId: number }) {
  const rows = useFriendlyRows(systemId);
  return (
    <div data-system-intel className="flex flex-col items-stretch gap-3 text-left">
      <IntelligenceHeader systemId={systemId} />
      <SignatureSummary systemId={systemId} />
      <FriendliesSection rows={rows} />
    </div>
  );
}
