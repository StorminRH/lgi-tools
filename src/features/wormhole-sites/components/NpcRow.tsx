import { Chip } from '@/components/ui/chip';
import { EntityRow, Stat } from '@/components/ui/row';
import type { Npc } from '../types';
import {
  DPS_TIER_CLASS,
  EWAR_LABEL,
  EWAR_TONE,
  TRIGGER_CHIP_TONE,
  dpsTier,
  type EwarKey,
} from './wormhole-styles';

const EWAR_ORDER: EwarKey[] = ['web', 'scram', 'neut', 'rr'];

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
  const tier = dpsTier(npc.dps);
  const chipNodes =
    ewars.length > 0 || npc.triggerLabel ? (
      <>
        {ewars.map((k) => (
          <Chip key={k} tone={EWAR_TONE[k]}>
            {k === 'neut' && npc.neut ? `NEUT ${npc.neut}` : EWAR_LABEL[k]}
          </Chip>
        ))}
        {npc.triggerLabel && <Chip tone={TRIGGER_CHIP_TONE}>TRIGGER</Chip>}
      </>
    ) : undefined;

  return (
    <EntityRow
      leading={<>{npc.quantity}×</>}
      name={npc.sleeperName}
      chips={chipNodes}
      trailing={
        <>
          {npc.dps != null && (
            <Stat className={DPS_TIER_CLASS[tier]}>{npc.dps} DPS</Stat>
          )}
        </>
      }
    />
  );
}

