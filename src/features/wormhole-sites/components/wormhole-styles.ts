import type { PillTone, ChipTone, DotTone } from '@/components/ui/tones';
import type { SiteType, WormholeClass } from '../types';

export const CLASS_TONE: Record<WormholeClass, PillTone> = {
  C1: 'green',
  C2: 'green-strong',
  C3: 'orange',
  C4: 'magenta',
  C5: 'red',
  C6: 'purple',
};

export const CLASS_CHIP_TONE: Record<WormholeClass, ChipTone> = {
  C1: 'green',
  C2: 'green',
  C3: 'orange',
  C4: 'purple',
  C5: 'red',
  C6: 'purple',
};

export const SITE_TYPE_TONE: Record<SiteType, PillTone> = {
  combat: 'red-soft',
  ore:    'yellow',
  gas:    'teal',
  relic:  'orange-soft',
  data:   'blue',
};

export const SITE_TYPE_CHIP_TONE: Record<SiteType, ChipTone> = {
  combat: 'red',
  ore: 'orange',
  gas: 'green',
  relic: 'orange',
  data: 'blue',
};

export const SITE_TYPE_DOT_TONE: Record<SiteType, DotTone> = {
  combat: 'red',
  ore: 'orange',
  gas: 'green',
  relic: 'orange',
  data: 'blue',
};

export const SITE_TYPE_LABEL: Record<SiteType, string> = {
  combat: 'Combat',
  ore:    'Ore',
  gas:    'Gas',
  relic:  'Relic',
  data:   'Data',
};

export type EwarKey = 'web' | 'scram' | 'neut' | 'rr';

export const EWAR_TONE: Record<EwarKey, ChipTone> = {
  web:   'blue',
  scram: 'red',
  neut:  'purple',
  rr:    'green',
};

export const EWAR_LABEL: Record<EwarKey, string> = {
  web:   'WEB',
  scram: 'SCRAM',
  neut:  'NEUT',
  rr:    'RR',
};

export const EWAR_ORDER: EwarKey[] = ['web', 'scram', 'neut', 'rr'];

export const TRIGGER_CHIP_TONE: ChipTone = 'orange';

export const HACKING_DOT_TONE: Record<'relic' | 'data', DotTone> = {
  relic: 'orange',
  data:  'blue',
};
