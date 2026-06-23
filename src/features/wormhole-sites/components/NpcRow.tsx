import { Chip } from '@/components/ui/chip';
import { Stat } from '@/components/ui/row';
import type { Npc } from '../types';
import { ShipClassIcon } from './ShipClassIcon';
import {
  EWAR_LABEL,
  EWAR_ORDER,
  EWAR_TONE,
  TRIGGER_CHIP_TONE,
  type EwarKey,
} from './wormhole-styles';

function npcEwarKeys(npc: Npc): EwarKey[] {
  const m: Record<EwarKey, number | null> = {
    web: npc.web,
    scram: npc.scram,
    neut: npc.neut,
    rr: npc.rrep,
  };
  return EWAR_ORDER.filter((k) => (m[k] ?? 0) !== 0);
}

/**
 * One NPC line inside a wave: hull-class badge + count · name · EWAR chips · DPS.
 * A subgrid row (the parent grid lives in `WaveCard`) so the name column shares a
 * track across the wave's rows — the EWAR chips line up in a column after the
 * longest name instead of starting ragged at the end of each name. The EWAR cell
 * is always rendered (empty when none) so the columns stay aligned. Mirrors
 * `EntityRow`'s spacing/divider/hover; it can't reuse `EntityRow` because that
 * primitive puts its chip column after the trailing stats.
 */
export function NpcRow({ npc }: { npc: Npc }) {
  const ewars = npcEwarKeys(npc);

  return (
    <div className="grid grid-cols-subgrid col-span-full items-center gap-[6px] py-[5px] border-t border-border-soft text-[12px] hover:bg-[rgba(255,255,255,0.018)]">
      <span className="inline-flex items-center gap-1.5 text-[10px] text-muted">
        <ShipClassIcon code={npc.sleeperClassCode} size={18} />
        {npc.quantity}×
      </span>
      <span data-npc-name className="text-name truncate min-w-0 leading-[1.5]">
        {npc.sleeperName}
      </span>
      <span className="flex items-center gap-[4px]">
        {ewars.map((k) => (
          <Chip key={k} tone={EWAR_TONE[k]}>
            {k === 'neut' && npc.neut ? `NEUT ${npc.neut}` : EWAR_LABEL[k]}
          </Chip>
        ))}
        {npc.triggerLabel && <Chip tone={TRIGGER_CHIP_TONE}>{npc.triggerLabel}</Chip>}
      </span>
      <span className="justify-self-end">
        {npc.dps != null && <Stat className="text-text font-semibold">{npc.dps} DPS</Stat>}
      </span>
    </div>
  );
}
