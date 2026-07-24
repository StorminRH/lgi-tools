// The page-settings spec — the TYPE each feature exports to the settings
// presentation registry (ACCOUNT.4). Leaf, value-free: a feature imports only
// this type, so the type edge drags in no engine runtime. The platform engine
// and composition wiring manifest build on it.
//
// A spec is pure DATA. It declares which value-registry settings a page surfaces
// (by key) and where, plus an optional per-surface character-strip opt-in. It
// renders nothing this session — ACCOUNT.5 reads it into the portrait menu,
// ACCOUNT.6 maps a key to its control, ACCOUNT.7 renders the strip.

import type { StripSurfaceId } from '@/lib/preferences';
import type { FeatureControlId } from './feature-controls';

// Where a control sits: the always-present global half of the menu, a per-page
// section, or inline on the page.
type SettingsPlacement = 'global' | 'section' | 'inline';

/**
 * A reference to ONE setting, in two kinds (ACCOUNT.6 grew the union):
 * - 'preference' (the default when `kind` is omitted, keeping pre-.6 spec
 *   literals valid as-is): a value-registry setting BY KEY (a lib/preferences
 *   PreferenceDef.key). Anti-drift is the engine test asserting every key is a
 *   registered preference.
 * - 'feature': a feature-owned, server-backed control BY ID (a
 *   ./feature-controls id — type-only import, so this module stays value-free).
 *   Pinned to placement 'inline' at the type level: a feature control never
 *   renders in the menu (D-3 — the menu hosts no confirm-gated/destructive
 *   flow); the menu resolver also drops it at runtime as cast-defense.
 * Exported for the presentation resolver (./controls); features keep importing
 * only the spec type.
 */
export type SettingsControlRef =
  | {
      kind?: 'preference';
      key: string;
      placement: SettingsPlacement;
      order?: number;
    }
  | {
      kind: 'feature';
      id: FeatureControlId;
      placement: 'inline';
      order?: number;
    };

/**
 * The per-surface character strip (D-7, per-feature opt-in). `surfaceId` names
 * the surface's dimmed-set preference (lib/preferences' STRIP_SURFACE_IDS —
 * type-only import, so declaring a strip for a surface with no registered
 * dimmed-set def is a compile error). Exported for the panels' prop seam
 * (ACCOUNT.7); features still import only spec types from this module.
 */
export type CharacterStripSpec = {
  surfaceId: StripSurfaceId;
};

/**
 * Declarative page-settings contract owning a route's controls, ordering, and optional
 * character-strip configuration.
 */
export type PageSettingsSpec = {
  // The base route this spec governs, matched against usePathname() — a `/sites`
  // spec also governs `/sites/30002`. The most-specific match wins.
  route: string;
  // Settings the page surfaces, referenced by value-registry key. Empty/omitted
  // is valid: a page can ship a spec with no controls yet (structure-first, D-8).
  controls?: SettingsControlRef[];
  // Optional per-surface character strip (D-7); omitted = no strip (e.g. /sites).
  strip?: CharacterStripSpec;
  // Optional label for the menu's dynamic half.
  title?: string;
};
