import { Chevron, Collapsible } from '@/components/ui/collapsible';
import type { Wave } from '../types';
import { EwarRow } from './EwarRow';
import { NpcRow } from './NpcRow';
import { DPS_TIER_CLASS, dpsTier } from './wormhole-styles';

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
  const tier = dpsTier(wave.dpsTotal);
  const displayLabel = label ?? wave.waveLabel;
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      header={
        <>
          <span className="text-[9px] font-semibold tracking-[0.16em] uppercase text-muted shrink-0">
            {displayLabel}
          </span>
          <span className={`text-[12px] font-semibold ${DPS_TIER_CLASS[tier]}`}>
            DPS {formatDps(wave.dpsTotal)}
          </span>
          <Chevron />
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
