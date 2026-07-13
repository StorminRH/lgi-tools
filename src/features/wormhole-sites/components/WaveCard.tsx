import { Collapsible } from '@/components/ui/collapsible';
import type { Wave } from '../types';
import { EwarRow } from './EwarRow';
import { NpcRow } from './NpcRow';

export function WaveCard({
  wave,
  label,
  defaultOpen = false,
  showEwar = false,
}: {
  wave: Wave;
  /** Override the wave's own waveLabel (e.g. "Initial", "Delayed") if needed. */
  label?: string;
  defaultOpen?: boolean;
  /** When the parent card hasn't already rendered a site-level EWAR row,
   *  render the wave's own EWAR row inside the wave body. */
  showEwar?: boolean;
}) {
  const displayLabel = label ?? wave.waveLabel;
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      headerClassName="bg-bg border-t border-border border-b border-border py-[10px]"
      header={
        <>
          <span className="text-label font-bold tracking-display uppercase text-text shrink-0">
            {displayLabel}
          </span>
          <span className="ml-auto text-micro font-semibold tracking-label text-text">
            DPS {formatDps(wave.dpsTotal)}
          </span>
        </>
      }
    >
      {showEwar && (
        <EwarRow
          web={wave.ewWeb}
          scram={wave.ewScram}
          neut={wave.ewNeut}
          rr={wave.ewRrep}
        />
      )}
      {/* Subgrid so the EWAR chips line up in one column (DPS far right). The name
       *  column width comes from `--npc-name-col` (set by NpcNameColScope to the
       *  widest name across ALL waves, so the columns line up across the whole
       *  expansion); it falls back to per-wave auto sizing before that runs. The
       *  row's horizontal padding lives here on the parent, not on the subgrid rows
       *  — padding on a subgrid offsets its inherited track lines and would collapse
       *  the 44px lead column. */}
      <div className="grid grid-cols-[44px_var(--npc-name-col,minmax(0,auto))_auto_1fr] px-3.5">
        {wave.npcs.map((npc) => (
          <NpcRow key={npc.id} npc={npc} />
        ))}
      </div>
    </Collapsible>
  );
}

function formatDps(dps: number | null): string {
  if (dps == null) return '—';
  return dps.toLocaleString();
}
