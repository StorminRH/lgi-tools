// The character strip section's view derivation (ACCOUNT.7) — the Humble
// Component split: the section stays a thin JSX shell over these tested helpers.
// Shared zone because both tracker features (skill queue, industry jobs) compose
// the section and features never import each other.
//
// One binding drives both the strip def AND the first-paint dimmed set: without a
// strip declaration the sentinel def reads as [] and no serverValue is offered, so
// nothing strip-related renders — children receive the untouched character list
// (today's render exactly). Dimming is view-only (see visibleCharacters); the sync
// ids the panels fetch are derived upstream and never touched here.

import { visibleCharacters } from './character-strip-model';
import type { PanelCharacter } from './live-character-card';
import { stripDimmedDef, type PreferenceDef } from '@/lib/preferences';
import type { CharacterStripSpec } from '@/platform/page-settings/types';

/**
 * The usePreference inputs for the section. `serverValue` (the cookie-read dimmed
 * set for the first paint) is offered only when a strip is declared; absent, the
 * hook falls through to the sentinel def's fallback and nothing dims.
 */
export type CharacterStripBinding = {
  def: PreferenceDef<number[]>;
  serverValue: number[] | undefined;
};

/**
 * Binds one character-strip setting to its typed preference key, default, and update callback so
 * renderers do not reconstruct preference policy.
 */
export function stripPreferenceBinding(
  strip: CharacterStripSpec | undefined,
  initialDimmed: number[] | undefined,
): CharacterStripBinding {
  return {
    def: stripDimmedDef(strip?.surfaceId),
    serverValue: strip !== undefined ? initialDimmed : undefined,
  };
}

/** The resolved view the section shell renders from. */
export type CharacterStripView = {
  hasStrip: boolean;
  visible: PanelCharacter[];
  showEmptyNotice: boolean;
  syncCaption: string;
};

/**
 * With a strip declared, the view-only filter drops dimmed healthy characters and
 * the all-hidden notice shows when nothing remains lit; without one, children get
 * the untouched list (no filtering, no notice). The sync caption is the same
 * loading/steady copy the section rendered inline.
 */
export function deriveStripView(
  strip: CharacterStripSpec | undefined,
  characters: PanelCharacter[],
  dimmedIds: readonly number[],
  loading: boolean,
): CharacterStripView {
  const hasStrip = strip !== undefined;
  const visible = hasStrip ? visibleCharacters(characters, dimmedIds) : characters;
  return {
    hasStrip,
    visible,
    showEmptyNotice: hasStrip && visible.length === 0,
    syncCaption: loading ? 'Loading…' : 'Synced from ESI on view',
  };
}
