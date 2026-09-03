import type { StripSurfaceId } from '@/lib/preferences';
import type { FeatureControlId } from './feature-controls';

export type SettingsPlacement = 'global' | 'section' | 'inline';

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

export type CharacterStripSpec = {
  surfaceId: StripSurfaceId;
};

export type PageSettingsSpec = {
  route: string;
  controls?: SettingsControlRef[];
  strip?: CharacterStripSpec;
  title?: string;
};
