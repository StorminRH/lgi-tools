import type { z } from 'zod';
import type { TemplatePlannerState } from './components/planner-contexts';
import { snapshotFieldSchemas, type PlanSnapshotV1, type TemplateFieldKey } from './template-snapshot';
import type { BlueprintStructure } from './types';

// The template-field manifest (3.7.23.1) — the ONE place a planner configurable
// is wired into saved templates: its serialized schema, its capture (a pure
// read of live state), its apply (a replay through the provider's PUBLIC
// setters — never a parallel hydration path, so the guarded-setter invariants
// hold on loaded state exactly as on hand-picked state), and its fallback (the
// unset default a malformed or dangling value degrades to). Save iterates the
// captures; load iterates the applies; the snapshot shape derives from the
// entries. Apply NEVER throws — a reference that no longer resolves degrades
// ITS field alone and returns a compact "what fell away" note.
//
// STANDING RULE: planner-configurable state lives on the provider (or a
// registered planner preference) — never component-local — so it flows through
// this manifest and the classification pins below. The pins can't see a
// future component-local useState; review holds that line.
//
// ADDING A CONFIGURABLE: add the field to snapshotFieldSchemas (the snapshot
// shape), an entry here (the mapped-type annotations fail tsc until both
// exist), and classify its setter in SETTER_CLASSIFICATION (which fails tsc
// the moment the setter lands on the context). Old saved snapshots simply lack
// the new field and degrade to its fallback — no migration.

/** The slice of the blueprint structure the applies validate against. */
export type TemplateStructureView = Pick<
  BlueprintStructure,
  'blueprintTypeId' | 'nodeActivityByBlueprint'
>;

/** Setter and lookup ports required to apply one template snapshot to a live planner. */
export interface ApplyCtx {
  ctx: TemplatePlannerState;
  structure: TemplateStructureView;
  // Filled by the buildSystem entry from its apply outcome; the station entry
  // validates against it (a station belongs to the just-fetched system, and
  // fresh provider state isn't re-readable mid-orchestration).
  fetchedStations: { id: number }[] | null;
}

/**
 * The configurable fields alone (the snapshot minus its identity fields) —
 * the one type expression every generic index below shares.
 */
export type TemplateFields = { [K in TemplateFieldKey]: PlanSnapshotV1[K] };

/** One versioned template field definition owning extraction, validation, and application. */
export interface TemplateField<K extends TemplateFieldKey> {
  schema: z.ZodType<TemplateFields[K]>;
  // The unset default — what a malformed saved value degrades to, and what an
  // absent field (an older snapshot after the shape grew) applies as.
  fallback: TemplateFields[K];
  capture: (ctx: TemplatePlannerState) => TemplateFields[K];
  apply: (a: ApplyCtx, value: TemplateFields[K]) => string | null | Promise<string | null>;
}

// Every producing-blueprint key a saved ME/TE override may target in THIS
// build: the tree's build nodes plus the top blueprint itself (the hero card's
// boxed ME/TE fields key on it).
function validOverrideKeys(structure: TemplateStructureView): Set<number> {
  const keys = new Set(Object.keys(structure.nodeActivityByBlueprint).map(Number));
  keys.add(structure.blueprintTypeId);
  return keys;
}

// Full-replacement override apply, shared by ME and TE: drop every live
// override, then set the saved pairs whose blueprint still exists in this
// build — dropped pairs aggregate into ONE note.
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

/**
 * Entries are declared in APPLY ORDER (Object key order is the orchestration
 * order). Two orderings are load-bearing: buildStructure before the reaction
 * pair (the #187 guard clears the pair on an id collision — the pair's own
 * applies must land after), and station after buildSystem (a station is only
 * valid inside the just-fetched system). buildSystem sits last-but-one so its
 * await never lets a user race window into the synchronous applies.
 */
export const TEMPLATE_MANIFEST: { readonly [K in TemplateFieldKey]: TemplateField<K> } = {
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
    // Captures the RESOLVED character — what the save-time planner displays
    // (an unknown stored preference id already mirrors the active character).
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
    // No liveness check: solar systems are SDE-stable, and a miss downstream
    // just leaves the reaction fee honestly unavailable (the existing path).
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
    // Pref-backed: applying WRITES the industry.costBasis preference (the
    // deliberate write-through — a loaded template's toggle must read as
    // saved; no session-only overlay).
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
    // Depths the recomputed tier cut doesn't produce are inert by design —
    // no note, the visible outcome is identical to the saved intent.
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
    // Pref-backed via persist: true — a loaded template's system becomes the
    // saved build location (write-through, same as costBasis). On a failed
    // fetch the slot clears rather than silently keeping the pre-load system.
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
      // Superseded: a user action raced the load and wins — not a degrade.
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

/**
 * The orchestration order — the manifest's declaration order (see the comment
 * above the manifest for why it's load-bearing).
 */
export const TEMPLATE_FIELD_KEYS = Object.keys(TEMPLATE_MANIFEST) as readonly TemplateFieldKey[];

// EVERY function-valued key on the pricing context. Built from the context
// type itself, so a new public setter fails the classification below at tsc
// until it's classified — 'snapshot' classifications must name a real manifest
// field, or be declared 'derived-or-account' / 'exempt' consciously.
type MutatorKeys = {
  [K in keyof TemplatePlannerState]-?: TemplatePlannerState[K] extends (...args: never[]) => unknown
    ? K
    : never;
}[keyof TemplatePlannerState];

/**
 * Closed industry planner vocabulary and canonical order for setter classification; consumers
 * derive validation and iteration from this one list.
 */
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

/**
 * Planner-scoped preference keys, classified: a template field (write-through
 * on load) or a conscious exemption. template-manifest.test.ts asserts every
 * planner.* / industry.* key in the preference registry appears here.
 */
export const PREF_CLASSIFICATION: Readonly<Record<string, TemplateFieldKey | 'exempt'>> = {
  'planner.buildLocation': 'buildSystem',
  'planner.buildCharacterId': 'buildCharacterId',
  'industry.costBasis': 'costBasis',
};

/** SAVE — a pure read of the planner's current configuration. Changes nothing. */
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

/**
 * LOAD — replay a snapshot through the public setters, per-field fail-open.
 * Each field is validated ALONE (references go stale after a valid save; one
 * malformed field degrades to its fallback rather than voiding the template),
 * then applied in manifest order. Returns the "what fell away" notes; never
 * throws, never leaves a field un-applied (full-replacement semantics — a
 * saved null clears).
 */
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

  // Cross-field pre-pass: a reaction structure equal to the build structure is
  // corrupt data (the guarded setter forbids that state at save time) —
  // degrade the reaction slot rather than recreating the forbidden state
  // through the raw setter.
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
