import { Pill } from '@/components/ui/pill';
import { Stat } from '@/components/ui/row';
import { activeEwarKeys, npcEwar } from '../ewar';
import type { Npc } from '../types';
import { ShipClassIcon } from './ShipClassIcon';
import { EWAR_LABEL, EWAR_TONE, TRIGGER_TONE } from './wormhole-styles';

export function NpcRow({ npc }: { npc: Npc }) {
  const ewars = activeEwarKeys(npcEwar(npc));

  return (
    <div className="grid grid-cols-subgrid col-span-full items-center gap-[6px] py-[5px] border-t border-border-soft text-ui hover:bg-row-hover">
      <span className="inline-flex items-center gap-1.5 text-micro text-muted">
        <ShipClassIcon code={npc.sleeperClassCode} size={18} />
        {npc.quantity}×
      </span>
      <span data-npc-name className="text-name truncate min-w-0 leading-[1.5]">
        {npc.sleeperName}
      </span>
      <span className="flex items-center gap-[4px]">
        {ewars.map((k) => (
          <Pill key={k} tone={EWAR_TONE[k]} className="shrink-0">
            {k === 'neut' && npc.neut ? `NEUT ${npc.neut}` : EWAR_LABEL[k]}
          </Pill>
        ))}
        {npc.triggerLabel && (
          <Pill tone={TRIGGER_TONE} className="shrink-0">
            {npc.triggerLabel}
          </Pill>
        )}
      </span>
      <span className="justify-self-end">
        {npc.dps != null && <Stat className="text-text font-semibold">{npc.dps} DPS</Stat>}
      </span>
    </div>
  );
}
