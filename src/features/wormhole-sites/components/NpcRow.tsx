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
  return EWAR_ORDER.filter((k) => (m[k] ?? 0) > 0);
}

export function NpcRow({ npc }: { npc: Npc }) {
  const ewars = npcEwarKeys(npc);
  const tier = dpsTier(npc.dps);
  return (
    <EntityRow
      leading={<>{npc.quantity}×</>}
      name={
        <>
          {npc.sleeperName}
          {ewars.map((k) => (
            <Chip key={k} tone={EWAR_TONE[k]}>
              {EWAR_LABEL[k]}
            </Chip>
          ))}
          {npc.triggerLabel && <Chip tone={TRIGGER_CHIP_TONE}>TRIGGER</Chip>}
        </>
      }
      trailing={
        <>
          {npc.ehp != null && <Stat>{formatEhp(npc.ehp)} EHP</Stat>}
          {npc.dps != null && (
            <Stat className={DPS_TIER_CLASS[tier]}>{npc.dps} DPS</Stat>
          )}
        </>
      }
    />
  );
}

function formatEhp(ehp: number): string {
  if (ehp >= 1000) return `${Math.round(ehp / 1000)}k`;
  return String(ehp);
}
