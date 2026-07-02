// The page-settings spec — the TYPE each feature exports to the settings
// presentation registry (ACCOUNT.4). Leaf, value-free: a feature imports only
// this type (`import type { PageSettingsSpec } from '@/page-settings/types'`),
// so the type edge drags in no engine runtime (the @/purge/types precedent). The
// engine (./index) and the wiring manifest (./register-all) build on it.
//
// A spec is pure DATA. It declares which value-registry settings a page surfaces
// (by key) and where, plus an optional per-surface character-strip opt-in. It
// renders nothing this session — ACCOUNT.5 reads it into the portrait menu,
// ACCOUNT.6 maps a key to its control, ACCOUNT.7 renders the strip.

// Where a control sits: the always-present global half of the menu, a per-page
// section, or inline on the page.
type SettingsPlacement = 'global' | 'section' | 'inline';

// A reference to ONE value-registry setting, BY KEY (a lib/preferences
// PreferenceDef.key). The menu never invents a setting — anti-drift is the
// engine test asserting every key is a registered preference. Exported for the
// presentation resolver (./controls); features keep importing only the spec type.
export type SettingsControlRef = {
  key: string;
  placement: SettingsPlacement;
  order?: number;
};

// The per-surface character strip (D-7, per-feature opt-in). Carried as a type
// the spec CAN declare; the strip component is ACCOUNT.7. `surfaceId` is the key
// its dimmed-set persists under.
type CharacterStripSpec = {
  surfaceId: string;
};

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
