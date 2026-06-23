import { Chip } from '@/components/ui/chip';
import { EntityRow, Stat } from '@/components/ui/row';
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

export function NpcRow({ npc }: { npc: Npc }) {
  const ewars = npcEwarKeys(npc);
  const chipNodes =
    ewars.length > 0 || npc.triggerLabel ? (
      <>
        {ewars.map((k) => (
          <Chip key={k} tone={EWAR_TONE[k]}>
            {k === 'neut' && npc.neut ? `NEUT ${npc.neut}` : EWAR_LABEL[k]}
          </Chip>
        ))}
        {npc.triggerLabel && <Chip tone={TRIGGER_CHIP_TONE}>{npc.triggerLabel}</Chip>}
      </>
    ) : undefined;

  return (
    <EntityRow
      colsClass="grid-cols-[44px_minmax(0,1fr)_auto]"
      leading={
        <span className="inline-flex items-center gap-1.5">
          <ShipClassIcon code={npc.sleeperClassCode} size={18} />
          {npc.quantity}×
        </span>
      }
      name={npc.sleeperName}
      chips={chipNodes}
      inlineChips
      trailing={
        <>
          {npc.dps != null && <Stat className="text-text">{npc.dps} DPS</Stat>}
        </>
      }
    />
  );
}

