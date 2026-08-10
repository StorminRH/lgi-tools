'use client';

// The system intelligence body shared by the node summary card and the
// click-through dock (which is pointer-inert — everything here stays
// non-interactive text). Operator-directed shape (4.0.4.2.3): the system name
// and its class up top, then a minimal two-column friendlies readout — pilot
// name left, one single-word status right — nothing more. Sections are keyed
// (`data-intel-section`) so future widget readouts (gas, anomalies) append as
// sibling sections without restructuring.
//
// Name/class come from the same node data the canvas renders (equality-stable
// store selectors, never the hot nodes array — the 4.0.3.3 window-layer rule);
// presence comes from the shared context; pilot names resolve through the
// shared /api/eve/names hook, with row assembly in the tested presence model.
import { cn } from '@/components/ui/cn';
import { useEntityNames } from '@/components/use-entity-names';
import { securityStatusTextClass } from '@/data/eve-data/security';
import { formatSec } from '@/data/eve-data/systems-search';
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

function IntelligenceHeader({
  systemId,
  showIdentity,
}: {
  readonly systemId: number;
  readonly showIdentity: boolean;
}) {
  const name = useNodeDataString(systemId, 'name');
  const className = useNodeDataString(systemId, 'className');
  const security = useNodeDataNumber(systemId, 'security');
  return (
    <section data-intel-section="summary" className="flex flex-col gap-1">
      {showIdentity ? (
        <div data-intel-identity className="flex items-baseline gap-2">
          <span className="font-data text-ui text-name">{name ?? String(systemId)}</span>
          {className !== null && (
            <span className="font-data text-micro uppercase tracking-label text-muted">
              {className}
            </span>
          )}
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-data text-label uppercase tracking-label text-muted">
          Security Status
        </span>
        <span className="flex items-baseline gap-2">
          {/* The dock hides the identity row, so the space class rides the
              security row there — a J-space "-1.0" alone reads as null-sec. */}
          {!showIdentity && className !== null ? (
            <span
              data-security-class
              className="font-data text-micro uppercase tracking-label text-muted"
            >
              {className}
            </span>
          ) : null}
          <span
            data-security-status
            className={cn(
              'font-data text-micro tabular-nums',
              securityStatusTextClass(security),
            )}
          >
            {formatSec(security)}
          </span>
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

/** Shared body for the dock and node summary with dock-only name deduplication. */
export function SystemIntelligenceBody({
  systemId,
  mode = 'summary',
}: {
  readonly systemId: number;
  readonly mode?: 'dock' | 'summary';
}) {
  const rows = useFriendlyRows(systemId);
  return (
    <div data-system-intel className="flex flex-col items-stretch gap-3 text-left">
      <IntelligenceHeader systemId={systemId} showIdentity={mode === 'summary'} />
      <SignatureSummary systemId={systemId} />
      <FriendliesSection rows={rows} />
    </div>
  );
}
