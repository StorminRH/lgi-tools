import type { PillTone, DotTone } from '@/components/ui/tones';
import { formatClassRange, siteClassRange } from '../site-class';
import type { SiteListItem, SiteType, WormholeClass } from '../types';

export const CLASS_TONE: Record<WormholeClass, PillTone> = {
  C1: 'green',
  C2: 'green-strong',
  C3: 'orange',
  C4: 'magenta',
  C5: 'red',
  C6: 'purple',
};

/**
 * A site's class pill: its own class, or a gas site's spawn range toned by
 * the lowest class in it. Null when the site has neither.
 */
export function siteClassPill(
  site: Pick<SiteListItem, 'wormholeClass' | 'siteType' | 'name'>,
): { tone: PillTone; label: string } | null {
  const range = siteClassRange(site);
  return range ? { tone: CLASS_TONE[range.min], label: formatClassRange(range) } : null;
}

export const SITE_TYPE_TONE: Record<SiteType, PillTone> = {
  combat: 'red-soft',
  ore:    'yellow',
  gas:    'teal',
  relic:  'orange-soft',
  data:   'blue',
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

export const EWAR_TONE: Record<EwarKey, PillTone> = {
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

export const TRIGGER_TONE: PillTone = 'orange';

export const HACKING_DOT_TONE: Record<'relic' | 'data', DotTone> = {
  relic: 'orange',
  data:  'blue',
};
