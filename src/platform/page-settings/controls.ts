// The presentation resolver (ACCOUNT.5, grown in ACCOUNT.6): turns a resolved
// page-settings spec into renderable control models. Pure and React-free — the
// ONE spec→controls resolution path, now with two views over the same
// internals: the portrait menu's dynamic half (resolveMenuControls, placement
// 'section') and the account settings page (resolvePageControls, placement
// 'inline').
//
// A preference ref renders when its key resolves to a registered ENUM
// preference (SegmentedControl — options from z.enum) or BOOLEAN preference
// (Switch). Other shapes (e.g. the planner's build-location object) and
// unknown keys drop out silently; anti-drift for unknown keys is the engine
// test's job. A feature ref resolves by id for the PAGE only — the menu drops
// it (D-3: no confirm-gated/destructive flow in the menu; the type already pins
// feature refs to 'inline', the runtime skip is cast-defense).

import { z } from 'zod';
import { getPreferenceDef, type PreferenceDef } from '@/lib/preferences';
import type { FeatureControlId } from './feature-controls';
import type { PageSettingsSpec, SettingsControlRef } from './types';

/** Enum preference row for SegmentedControl presentation. */
export type EnumMenuControlModel = {
  kind: 'preference-enum';
  key: string;
  /** Optional one-line consequence note declared on the spec ref. */
  description?: string;
  // Display label derived from the key ('sites.detailMode' → 'detail mode');
  // a per-key override registry stays a future growth with this derivation as
  // its fallback.
  label: string;
  options: readonly string[];
  def: PreferenceDef<string>;
};

/** Boolean preference row for Switch presentation. */
export type BooleanMenuControlModel = {
  kind: 'preference-boolean';
  key: string;
  label: string;
  /** Optional one-line consequence note declared on the spec ref. */
  description?: string;
  def: PreferenceDef<boolean>;
};

/** Display-ready page-menu control with stable identity, label, state, and controlled update behavior. */
export type MenuControlModel = EnumMenuControlModel | BooleanMenuControlModel;

/**
 * A feature-owned, server-backed control, resolved by id. The settings page
 * maps the id to that slice's component; the resolver stays data-only.
 */
export type FeatureControlModel = {
  kind: 'feature';
  id: FeatureControlId;
};

/** Display-ready union of controls and actions that a page can publish to the shared menu. */
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

function preferenceModel(
  ref: { key: string; description?: string },
): MenuControlModel | null {
  const def = getPreferenceDef(ref.key);
  if (def === undefined) return null;
  const label = labelFromKey(ref.key);
  if (def.schema instanceof z.ZodEnum) {
    return {
      kind: 'preference-enum',
      key: ref.key,
      label,
      description: ref.description,
      options: def.schema.options as readonly string[],
      // Safe: the schema is a string enum, so the def's value type is string.
      def: def as PreferenceDef<string>,
    };
  }
  if (def.schema instanceof z.ZodBoolean) {
    return {
      kind: 'preference-boolean',
      key: ref.key,
      label,
      description: ref.description,
      def: def as PreferenceDef<boolean>,
    };
  }
  return null;
}

/**
 * Resolves registered page controls into ordered menu models, omitting controls whose current
 * state makes them unavailable.
 */
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

/**
 * Resolves the current route's page-settings declaration into display-ready controls using the
 * supplied preference and feature state.
 */
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
