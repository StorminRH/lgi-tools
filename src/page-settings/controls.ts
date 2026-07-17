// The presentation resolver (ACCOUNT.5, grown in ACCOUNT.6): turns a resolved
// page-settings spec into renderable control models. Pure and React-free — the
// ONE spec→controls resolution path, now with two views over the same
// internals: the portrait menu's dynamic half (resolveMenuControls, placement
// 'section') and the account settings page (resolvePageControls, placement
// 'inline').
//
// A preference ref renders only when its key resolves to a registered ENUM
// preference: the options come straight off the def's z.enum (zero per-key
// presentation config — the segments show the raw values, exactly as the /sites
// page toggles do). Non-enum defs (e.g. the planner's build-location object)
// and unknown keys drop out silently; anti-drift for unknown keys is the engine
// test's job. A feature ref resolves by id for the PAGE only — the menu drops
// it (D-3: no confirm-gated/destructive flow in the menu; the type already pins
// feature refs to 'inline', the runtime skip is cast-defense).

import { z } from 'zod';
import { getPreferenceDef, type PreferenceDef } from '@/lib/preferences';
import type { FeatureControlId } from './feature-controls';
import type { PageSettingsSpec, SettingsControlRef } from './types';

export type MenuControlModel = {
  kind: 'preference';
  key: string;
  // Display label derived from the key ('sites.detailMode' → 'detail mode');
  // a per-key override registry stays a future growth with this derivation as
  // its fallback.
  label: string;
  options: readonly string[];
  def: PreferenceDef<string>;
};

/**
 * A feature-owned, server-backed control, resolved by id. The settings page
 * maps the id to its owning slice's component; the resolver stays data-only.
 */
export type FeatureControlModel = {
  kind: 'feature';
  id: FeatureControlId;
};

export type PageControlModel = MenuControlModel | FeatureControlModel;

// Refs at ONE placement. Explicit `order` sorts first (ascending); refs without
// one follow in declaration order.
function placedControls(
  spec: PageSettingsSpec,
  placement: SettingsControlRef['placement'],
): SettingsControlRef[] {
  return (spec.controls ?? [])
    .filter((ref) => ref.placement === placement)
    .map((ref, index) => ({ ref, index }))
    .sort(
      (a, b) =>
        (a.ref.order ?? Number.MAX_SAFE_INTEGER) - (b.ref.order ?? Number.MAX_SAFE_INTEGER) ||
        a.index - b.index,
    )
    .map((entry) => entry.ref);
}

function labelFromKey(key: string): string {
  const segment = key.slice(key.lastIndexOf('.') + 1);
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

function preferenceModel(ref: { key: string }): MenuControlModel | null {
  const def = getPreferenceDef(ref.key);
  if (def === undefined) return null;
  if (!(def.schema instanceof z.ZodEnum)) return null;
  return {
    kind: 'preference',
    key: ref.key,
    label: labelFromKey(ref.key),
    options: def.schema.options as readonly string[],
    // Safe: the schema is a string enum, so the def's value type is string.
    def: def as PreferenceDef<string>,
  };
}

export function resolveMenuControls(spec: PageSettingsSpec | null): MenuControlModel[] {
  if (spec === null) return [];
  const models: MenuControlModel[] = [];
  for (const ref of placedControls(spec, 'section')) {
    if (ref.kind === 'feature') continue;
    const model = preferenceModel(ref);
    if (model !== null) models.push(model);
  }
  return models;
}

export function resolvePageControls(spec: PageSettingsSpec | null): PageControlModel[] {
  if (spec === null) return [];
  const models: PageControlModel[] = [];
  for (const ref of placedControls(spec, 'inline')) {
    if (ref.kind === 'feature') {
      models.push({ kind: 'feature', id: ref.id });
      continue;
    }
    const model = preferenceModel(ref);
    if (model !== null) models.push(model);
  }
  return models;
}
