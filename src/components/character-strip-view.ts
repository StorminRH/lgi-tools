import { visibleCharacters } from './character-strip-model';
import type { PanelCharacter } from '@/platform/auth/panel-character';
import type { CharacterStripSpec } from '@/platform/page-settings/types';

export type CharacterStripView = {
  hasStrip: boolean;
  visible: PanelCharacter[];
  showEmptyNotice: boolean;
};

export function deriveStripView(
  strip: CharacterStripSpec | undefined,
  characters: PanelCharacter[],
  dimmedIds: readonly number[],
): CharacterStripView {
  const hasStrip = strip !== undefined;
  const visible = hasStrip ? visibleCharacters(characters, dimmedIds) : characters;
  return {
    hasStrip,
    visible,
    showEmptyNotice: hasStrip && visible.length === 0,
  };
}
