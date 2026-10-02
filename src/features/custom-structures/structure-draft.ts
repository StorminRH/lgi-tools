import type { EnteredBonuses } from '@/data/industry-math/entered-bonuses';
import { parseFacilityTaxDraft, taxDraftFromStored } from '@/data/industry-math/fees';
import { MAX_CUSTOM_STRUCTURE_RIGS } from './api-contract';
import type { CustomStructureRow } from './types';

export type BonusField = 'me' | 'te' | 'cost' | 'rxnMe' | 'rxnTe';
export type BonusDraft = Record<BonusField, string>;

/** `values`: numbers typed from the industry window. `rigs`: a known fit. */
export type BonusMode = 'values' | 'rigs';

export interface StructureDraft {
  name: string;
  structureTypeId: number | null;
  systemId: number | null;
  taxDraft: string;
  mode: BonusMode;
  rigSlots: (number | null)[];
  bonus: BonusDraft;
}

const MAX_BONUS_PCT = 99;
const emptySlots = (): (number | null)[] => Array.from({ length: MAX_CUSTOM_STRUCTURE_RIGS }, () => null);
const draftPct = (n: number): string => (n === 0 ? '' : String(n));

export function slotsFromRigs(rigTypeIds: readonly number[]): (number | null)[] {
  return emptySlots().map((_, i) => rigTypeIds[i] ?? null);
}

function bonusDraftFrom(bonuses: EnteredBonuses | null): BonusDraft {
  return {
    me: draftPct(bonuses?.manufacturing.me ?? 0),
    te: draftPct(bonuses?.manufacturing.te ?? 0),
    cost: draftPct(bonuses?.manufacturing.cost ?? 0),
    rxnMe: draftPct(bonuses?.reactions.me ?? 0),
    rxnTe: draftPct(bonuses?.reactions.te ?? 0),
  };
}

export function emptyStructureDraft(): StructureDraft {
  return {
    name: '',
    structureTypeId: null,
    systemId: null,
    taxDraft: '',
    mode: 'values',
    rigSlots: emptySlots(),
    bonus: bonusDraftFrom(null),
  };
}

export function draftFromRow(row: CustomStructureRow): StructureDraft {
  return {
    name: row.name,
    structureTypeId: row.structureTypeId,
    systemId: row.systemId,
    taxDraft: taxDraftFromStored(row.taxPct),
    mode: row.rigTypeIds.length > 0 ? 'rigs' : 'values',
    rigSlots: slotsFromRigs(row.rigTypeIds),
    bonus: bonusDraftFrom(row.bonuses),
  };
}

function parsePct(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 && n <= MAX_BONUS_PCT ? n : null;
}

function parseBonusDraft(draft: BonusDraft): EnteredBonuses | null {
  const [me, te, cost, rxnMe, rxnTe] = [draft.me, draft.te, draft.cost, draft.rxnMe, draft.rxnTe].map(parsePct);
  if ([me, te, cost, rxnMe, rxnTe].some((n) => n === null)) return null;
  return {
    manufacturing: { me: me!, te: te!, cost: cost! },
    reactions: { me: rxnMe!, te: rxnTe! },
  };
}

export interface StructurePayload {
  name: string;
  structureTypeId: number;
  rigTypeIds: number[];
  systemId: number | null;
  taxPct: number | null;
  bonuses: EnteredBonuses | null;
}

export type PayloadResult = { ok: true; payload: StructurePayload } | { ok: false; field: 'name' | 'hull' | 'tax' | 'bonus' };

/** The request body for a draft, or the first field that stops it saving. */
export function payloadFromDraft(draft: StructureDraft): PayloadResult {
  const name = draft.name.trim();
  if (name === '') return { ok: false, field: 'name' };
  if (draft.structureTypeId === null) return { ok: false, field: 'hull' };
  const tax = parseFacilityTaxDraft(draft.taxDraft);
  if (!tax.ok) return { ok: false, field: 'tax' };
  const rigs = draft.mode === 'rigs';
  const bonuses = rigs ? null : parseBonusDraft(draft.bonus);
  if (!rigs && bonuses === null) return { ok: false, field: 'bonus' };
  return {
    ok: true,
    payload: {
      name,
      structureTypeId: draft.structureTypeId,
      rigTypeIds: rigs ? draft.rigSlots.filter((r): r is number => r !== null) : [],
      systemId: draft.systemId,
      taxPct: tax.value,
      bonuses,
    },
  };
}
