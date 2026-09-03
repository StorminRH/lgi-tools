import { visibleCharacters } from './character-strip-model';
import type { PanelCharacter } from './live-character-card';
import { stripDimmedDef, type PreferenceDef } from '@/lib/preferences';
import type { CharacterStripSpec } from '@/platform/page-settings/types';

export type CharacterStripBinding = {
  def: PreferenceDef<number[]>;
  serverValue: number[] | undefined;
};

export function stripPreferenceBinding(
  strip: CharacterStripSpec | undefined,
  initialDimmed: number[] | undefined,
): CharacterStripBinding {
  return {
    def: stripDimmedDef(strip?.surfaceId),
    serverValue: strip !== undefined ? initialDimmed : undefined,
  };
}

export type CharacterStripView = {
  hasStrip: boolean;
  visible: PanelCharacter[];
  showEmptyNotice: boolean;
  syncCaption: string;
};

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
