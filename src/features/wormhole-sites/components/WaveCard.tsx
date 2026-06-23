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
          <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-text shrink-0">
            {displayLabel}
          </span>
          <span className="ml-auto text-[9px] font-semibold tracking-[0.08em] text-text">
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
      {wave.npcs.map((npc) => (
        <NpcRow key={npc.id} npc={npc} />
      ))}
    </Collapsible>
  );
}

function formatDps(dps: number | null): string {
  if (dps == null) return '—';
  return dps.toLocaleString();
}
