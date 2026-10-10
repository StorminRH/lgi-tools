import { Collapsible } from '@/components/ui/collapsible';
import { formatQuantity } from '@/lib/format/number';
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
  label?: string;
  defaultOpen?: boolean;
  showEwar?: boolean;
}) {
  const displayLabel = label ?? wave.waveLabel;
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      headerClassName="bg-bg-deep/60 border-t border-border border-b border-border py-[10px]"
      header={
        <>
          <span className="text-label font-bold tracking-eyebrow uppercase text-text shrink-0">
            {displayLabel}
          </span>
          <span className="ml-auto text-micro font-semibold tracking-label text-text">
            DPS {formatQuantity(wave.dpsTotal)}
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
      <div className="grid grid-cols-[44px_var(--npc-name-col,minmax(0,auto))_auto_1fr] px-3.5">
        {wave.npcs.map((npc) => (
          <NpcRow key={npc.id} npc={npc} />
        ))}
      </div>
    </Collapsible>
  );
}
