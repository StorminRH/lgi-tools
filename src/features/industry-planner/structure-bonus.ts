import type { SecurityClass } from '@/data/eve-data/security';
import type { AttrMap } from '@/data/eve-data/types';

export type { SecurityClass };

const ATTR = {

  engMaterialBonus: 2600,
  engCostBonus: 2601,
  engTimeBonus: 2602,
  reactionTimeBonus: 2721,

  rigMfgTime: 2593,
  rigMfgMaterial: 2594,
  rigMfgCost: 2595,
  rigReactionTime: 2713,

  secMultHigh: 2355,
  secMultLow: 2356,
  secMultNull: 2357,
} as const;

export const MANUFACTURING_ACTIVITY = 1;

export const REACTION_ACTIVITY = 11;

export type IndustryActivityId = typeof MANUFACTURING_ACTIVITY | typeof REACTION_ACTIVITY;

export interface StructureBonus {
  me: number;
  te: number;
  costBonus: number;
}

export interface StructureBonusInput {

  structureAttrs: AttrMap;

  rigAttrs: AttrMap[];
  securityClass: SecurityClass;
  activityId: IndustryActivityId;
}

function val(attrs: AttrMap, id: number, fallback = 0): number {
  const v = attrs[id];
  return v === undefined ? fallback : v;
}

function secMultAttrId(sec: SecurityClass): number {
  if (sec === 'high') return ATTR.secMultHigh;
  if (sec === 'low') return ATTR.secMultLow;
  return ATTR.secMultNull;
}

function rigFactor(rig: AttrMap, baseAttrId: number, sec: SecurityClass): number {
  const base = val(rig, baseAttrId);
  if (base === 0) return 1;
  const secMult = val(rig, secMultAttrId(sec));
  return 1 + (base / 100) * secMult;
}

function reductionPct(
  structureMult: number,
  rigs: AttrMap[],
  rigBaseAttrId: number,
  sec: SecurityClass,
): number {
  let modifier = structureMult;
  for (const rig of rigs) modifier *= rigFactor(rig, rigBaseAttrId, sec);
  return (1 - modifier) * 100;
}

export function computeStructureBonus(input: StructureBonusInput): StructureBonus {
  const { structureAttrs, rigAttrs, securityClass, activityId } = input;

  if (activityId === REACTION_ACTIVITY) {

    const te = reductionPct(
      val(structureAttrs, ATTR.reactionTimeBonus, 1),
      rigAttrs,
      ATTR.rigReactionTime,
      securityClass,
    );
    return { me: 0, te, costBonus: 0 };
  }

  return {
    me: reductionPct(val(structureAttrs, ATTR.engMaterialBonus, 1), rigAttrs, ATTR.rigMfgMaterial, securityClass),
    te: reductionPct(val(structureAttrs, ATTR.engTimeBonus, 1), rigAttrs, ATTR.rigMfgTime, securityClass),
    costBonus: reductionPct(val(structureAttrs, ATTR.engCostBonus, 1), rigAttrs, ATTR.rigMfgCost, securityClass),
  };
}
