import type { z } from 'zod';
import type { TemplatePlannerState } from './components/planner-contexts';
import { snapshotFieldSchemas, type PlanSnapshotV1, type TemplateFieldKey } from './template-snapshot';
import type { BlueprintStructure } from './types';

export type TemplateStructureView = Pick<
  BlueprintStructure,
  'blueprintTypeId' | 'nodeActivityByBlueprint'
>;

export interface ApplyCtx {
  ctx: TemplatePlannerState;
  structure: TemplateStructureView;

  fetchedStations: { id: number }[] | null;
}

type TemplateFields = { [K in TemplateFieldKey]: PlanSnapshotV1[K] };

interface TemplateField<K extends TemplateFieldKey> {
  schema: z.ZodType<TemplateFields[K]>;

  fallback: TemplateFields[K];
  capture: (ctx: TemplatePlannerState) => TemplateFields[K];
  apply: (a: ApplyCtx, value: TemplateFields[K]) => string | null | Promise<string | null>;
}

function validOverrideKeys(structure: TemplateStructureView): Set<number> {
  const keys = new Set(Object.keys(structure.nodeActivityByBlueprint).map(Number));
  keys.add(structure.blueprintTypeId);
  return keys;
}

function applyOverrides(
  a: ApplyCtx,
  value: readonly (readonly [number, number])[],
  current: ReadonlyMap<number, number>,
  set: (blueprintTypeId: number, v: number) => void,
  reset: (blueprintTypeId: number) => void,
  label: string,
): string | null {
  for (const key of [...current.keys()]) reset(key);
  const valid = validOverrideKeys(a.structure);
  let dropped = 0;
  for (const [bp, v] of value) {
    if (valid.has(bp)) set(bp, v);
    else dropped += 1;
  }
  return dropped > 0
    ? `${String(dropped)} ${label} override${dropped === 1 ? ' no longer applies' : 's no longer apply'} to this build — dropped`
    : null;
}

const TEMPLATE_MANIFEST: { readonly [K in TemplateFieldKey]: TemplateField<K> } = {
  runs: {
    schema: snapshotFieldSchemas.runs,
    fallback: 1,
    capture: (ctx) => ctx.runs,
    apply: (a, value) => {
      a.ctx.setRuns(value);
      return null;
    },
  },
  buildCharacterId: {
    schema: snapshotFieldSchemas.buildCharacterId,
    fallback: null,

    capture: (ctx) => ctx.buildCharacter?.characterId ?? null,
    apply: (a, value) => {
      if (value === null) {
        a.ctx.setBuildCharacter(null);
        return null;
      }
      const known = a.ctx.buildCharacters?.some((c) => c.characterId === value) ?? false;
      if (!known) {
        a.ctx.setBuildCharacter(null);
        return 'Build character is no longer linked — using the active character';
      }
      a.ctx.setBuildCharacter(value);
      return null;
    },
  },
  buildStructure: {
    schema: snapshotFieldSchemas.buildStructure,
    fallback: null,
    capture: (ctx) =>
      ctx.selectedStructure ? { id: ctx.selectedStructure.id, name: ctx.selectedStructure.name } : null,
    apply: (a, value) => {
      if (value === null) {
        a.ctx.setSelectedStructure(null);
        return null;
      }
      const found = a.ctx.availableStructures?.find((s) => s.id === value.id) ?? null;
      if (!found) {
        a.ctx.setSelectedStructure(null);
        return `Build structure "${value.name}" is gone or no longer shared — cleared`;
      }
      a.ctx.setSelectedStructure(found);
      return null;
    },
  },
  reactionSystem: {
    schema: snapshotFieldSchemas.reactionSystem,
    fallback: null,
    capture: (ctx) => (ctx.reactionSystem ? { ...ctx.reactionSystem } : null),

    apply: (a, value) => {
      a.ctx.setReactionSystem(value);
      return null;
    },
  },
  reactionStructure: {
    schema: snapshotFieldSchemas.reactionStructure,
    fallback: null,
    capture: (ctx) =>
      ctx.reactionStructure ? { id: ctx.reactionStructure.id, name: ctx.reactionStructure.name } : null,
    apply: (a, value) => {
      if (value === null) {
        a.ctx.setReactionStructure(null);
        return null;
      }
      const found = a.ctx.availableStructures?.find((s) => s.id === value.id) ?? null;
      if (!found) {
        a.ctx.setReactionStructure(null);
        return `Reaction structure "${value.name}" is gone or no longer shared — cleared`;
      }
      a.ctx.setReactionStructure(found);
      return null;
    },
  },
  meOverrides: {
    schema: snapshotFieldSchemas.meOverrides,
    fallback: [],
    capture: (ctx) => [...ctx.meOverrides].sort((x, y) => x[0] - y[0]),
    apply: (a, value) =>
      applyOverrides(a, value, a.ctx.meOverrides, a.ctx.setMeOverride, a.ctx.resetMeOverride, 'ME'),
  },
  teOverrides: {
    schema: snapshotFieldSchemas.teOverrides,
    fallback: [],
    capture: (ctx) => [...ctx.teOverrides].sort((x, y) => x[0] - y[0]),
    apply: (a, value) =>
      applyOverrides(a, value, a.ctx.teOverrides, a.ctx.setTeOverride, a.ctx.resetTeOverride, 'TE'),
  },
  costBasis: {
    schema: snapshotFieldSchemas.costBasis,
    fallback: 'marginal',
    capture: (ctx) => ctx.costBasis,

    apply: (a, value) => {
      a.ctx.setCostBasis(value);
      return null;
    },
  },
  marginMode: {
    schema: snapshotFieldSchemas.marginMode,
    fallback: 'net',
    capture: (ctx) => ctx.marginMode,
    apply: (a, value) => {
      a.ctx.setMarginMode(value);
      return null;
    },
  },
  multibuyMode: {
    schema: snapshotFieldSchemas.multibuyMode,
    fallback: 'Remaining',
    capture: (ctx) => ctx.multibuyMode,
    apply: (a, value) => {
      a.ctx.setMultibuyMode(value);
      return null;
    },
  },
  multibuyUncheckedTiers: {
    schema: snapshotFieldSchemas.multibuyUncheckedTiers,
    fallback: [],
    capture: (ctx) => [...ctx.multibuyUncheckedTiers].sort((x, y) => x - y),

    apply: (a, value) => {
      a.ctx.setMultibuyUncheckedTiers(new Set(value));
      return null;
    },
  },
  buildSystem: {
    schema: snapshotFieldSchemas.buildSystem,
    fallback: null,
    capture: (ctx) =>
      ctx.location
        ? {
            systemId: ctx.location.systemId,
            systemName: ctx.location.systemName,
            security: ctx.location.security,
          }
        : null,

    apply: async (a, value) => {
      a.fetchedStations = null;
      if (value === null) {
        a.ctx.clearBuildLocation();
        return null;
      }
      const outcome = await a.ctx.applyBuildSystem(value, { persist: true });
      if (outcome.status === 'applied') {
        a.fetchedStations = outcome.data.stations;
        return null;
      }
      if (outcome.status === 'failed') {
        a.ctx.clearBuildLocation();
        return `Build system "${value.systemName}" couldn't load — cleared`;
      }

      return null;
    },
  },
  station: {
    schema: snapshotFieldSchemas.station,
    fallback: null,
    capture: (ctx) => (ctx.station ? { ...ctx.station } : null),
    apply: (a, value) => {
      if (value === null) {
        a.ctx.setStation(null, null);
        return null;
      }
      const known = a.fetchedStations?.some((s) => s.id === value.id) ?? false;
      if (!known) {
        a.ctx.setStation(null, null);
        return `Station "${value.name}" isn't in the loaded system — cleared`;
      }
      a.ctx.setStation(value.id, value.name);
      return null;
    },
  },
};

export const TEMPLATE_FIELD_KEYS = Object.keys(TEMPLATE_MANIFEST) as readonly TemplateFieldKey[];

type MutatorKeys = {
  [K in keyof TemplatePlannerState]-?: TemplatePlannerState[K] extends (...args: never[]) => unknown
    ? K
    : never;
}[keyof TemplatePlannerState];

export const SETTER_CLASSIFICATION = {
  setRuns: 'runs',
  setLocation: 'buildSystem',
  applyBuildSystem: 'buildSystem',
  clearBuildLocation: 'buildSystem',
  setStation: 'station',
  setBuildCharacter: 'buildCharacterId',
  setSelectedStructure: 'buildStructure',
  setReactionStructure: 'reactionStructure',
  setReactionSystem: 'reactionSystem',
  setMeOverride: 'meOverrides',
  resetMeOverride: 'meOverrides',
  setTeOverride: 'teOverrides',
  resetTeOverride: 'teOverrides',
  setCostBasis: 'costBasis',
  setMarginMode: 'marginMode',
  setMultibuyMode: 'multibuyMode',
  setMultibuyUncheckedTiers: 'multibuyUncheckedTiers',
} as const satisfies Record<MutatorKeys, TemplateFieldKey | 'derived-or-account' | 'exempt'>;

export const PREF_CLASSIFICATION: Readonly<Record<string, TemplateFieldKey | 'exempt'>> = {
  'planner.buildLocation': 'buildSystem',
  'planner.buildCharacterId': 'buildCharacterId',
  'industry.costBasis': 'costBasis',
};

export function captureTemplate(
  ctx: TemplatePlannerState,
  blueprintTypeId: number,
): PlanSnapshotV1 {
  const fields = {} as TemplateFields;
  const captureField = <K extends TemplateFieldKey>(key: K) => {
    fields[key] = TEMPLATE_MANIFEST[key].capture(ctx);
  };
  for (const key of TEMPLATE_FIELD_KEYS) captureField(key);
  return { v: 1, blueprintTypeId, ...fields };
}

export async function applyTemplate(
  a: ApplyCtx,
  snapshot: Readonly<Record<string, unknown>>,
): Promise<string[]> {
  const notes: string[] = [];
  const parsed = {} as TemplateFields;
  const parseField = <K extends TemplateFieldKey>(key: K) => {
    const entry = TEMPLATE_MANIFEST[key];
    const result = entry.schema.safeParse(snapshot[key]);
    if (result.success) {
      parsed[key] = result.data;
    } else {
      parsed[key] = entry.fallback;
      if (key in snapshot) notes.push(`Saved ${key} couldn't be read — reset`);
    }
  };
  for (const key of TEMPLATE_FIELD_KEYS) parseField(key);

  if (
    parsed.buildStructure !== null &&
    parsed.reactionStructure !== null &&
    parsed.buildStructure.id === parsed.reactionStructure.id
  ) {
    parsed.reactionStructure = null;
    notes.push('Reaction structure duplicated the build structure — cleared');
  }

  const applyField = async <K extends TemplateFieldKey>(key: K) => {
    const note = await TEMPLATE_MANIFEST[key].apply(a, parsed[key]);
    if (note) notes.push(note);
  };
  for (const key of TEMPLATE_FIELD_KEYS) await applyField(key);
  return notes;
}
