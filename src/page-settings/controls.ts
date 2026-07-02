// The presentation resolver (ACCOUNT.5): turns a resolved page-settings spec
// into the renderable control models the portrait menu's dynamic half maps
// over. Pure and React-free — the ONE spec→controls resolution path; ACCOUNT.6's
// account-settings page grows key→control presentation here rather than forking
// a second one.
//
// A control renders only when its key resolves to a registered ENUM preference:
// the options come straight off the def's z.enum (zero per-key presentation
// config — the segments show the raw values, exactly as the /sites page toggles
// do). Non-enum defs (e.g. the planner's build-location object) and unknown keys
// drop out silently; anti-drift for unknown keys is the engine test's job.

import { z } from 'zod';
import { getPreferenceDef, type PreferenceDef } from '@/lib/preferences';
import type { PageSettingsSpec, SettingsControlRef } from './types';

export type MenuControlModel = {
  key: string;
  // Display label derived from the key ('sites.detailMode' → 'detail mode');
  // ACCOUNT.6's presentation registry overrides this, with the derivation as
  // the fallback.
  label: string;
  options: readonly string[];
  def: PreferenceDef<string>;
};

// `placement: 'section'` refs only — 'inline' is page-owned and 'global' has no
// consumer pre-ACCOUNT.6. Explicit `order` sorts first (ascending); refs without
// one follow in declaration order.
function sectionControls(spec: PageSettingsSpec): SettingsControlRef[] {
  return (spec.controls ?? [])
    .filter((ref) => ref.placement === 'section')
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

export function resolveMenuControls(spec: PageSettingsSpec | null): MenuControlModel[] {
  if (spec === null) return [];
  const models: MenuControlModel[] = [];
  for (const ref of sectionControls(spec)) {
    const def = getPreferenceDef(ref.key);
    if (def === undefined) continue;
    if (!(def.schema instanceof z.ZodEnum)) continue;
    models.push({
      key: ref.key,
      label: labelFromKey(ref.key),
      options: def.schema.options as readonly string[],
      // Safe: the schema is a string enum, so the def's value type is string.
      def: def as PreferenceDef<string>,
    });
  }
  return models;
}
