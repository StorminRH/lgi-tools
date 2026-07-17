import type { PillTone, ChipTone, DotTone } from '@/components/ui/tones';
import type { SiteType, WormholeClass } from '../types';

/**
 * Domain → UI tone mappings. The only file in the codebase where
 * "WEB is blue" or "C5 is red" lives. Components in `src/components/ui/`
 * stay domain-agnostic; this file translates wormhole concepts into the
 * primitive layer's abstract tones.
 */

/** Authoritative mapping from wormhole class labels to abstract UI tones. */
export const CLASS_TONE: Record<WormholeClass, PillTone> = {
  C1: 'green',
  C2: 'green-strong',
  C3: 'orange',
  C4: 'magenta',
  C5: 'red',
  C6: 'purple',
};

/** Authoritative mapping from site families to abstract UI tones. */
export const SITE_TYPE_TONE: Record<SiteType, PillTone> = {
  combat: 'red-soft',
  ore:    'yellow',
  gas:    'teal',
  relic:  'orange-soft',
  data:   'blue',
};

/** Authoritative user-facing labels for canonical site families. */
export const SITE_TYPE_LABEL: Record<SiteType, string> = {
  combat: 'Combat',
  ore:    'Ore',
  gas:    'Gas',
  relic:  'Relic',
  data:   'Data',
};

/** EWAR keys on Wave / Npc rows → chip color. */
export type EwarKey = 'web' | 'scram' | 'neut' | 'rr';

/** Authoritative mapping from EWAR kinds to abstract UI tones. */
export const EWAR_TONE: Record<EwarKey, ChipTone> = {
  web:   'blue',
  scram: 'red',
  neut:  'purple',
  rr:    'green',
};

/** Authoritative user-facing labels for EWAR kinds. */
export const EWAR_LABEL: Record<EwarKey, string> = {
  web:   'WEB',
  scram: 'SCRAM',
  neut:  'NEUT',
  rr:    'RR',
};

/** Display order for EWAR chips/pills, matching the prototype: WEB, SCRAM, NEUT, RR. */
export const EWAR_ORDER: EwarKey[] = ['web', 'scram', 'neut', 'rr'];

/** Trigger labels (free-text in DB) → trigger chip is always orange. */
export const TRIGGER_CHIP_TONE: ChipTone = 'orange';

/** Hackable-container site types → bullet-dot abstract tone. The Dot
 *  primitive itself only knows colors; this is where "relic = orange,
 *  data = blue" lives. */
export const HACKING_DOT_TONE: Record<'relic' | 'data', DotTone> = {
  relic: 'orange',
  data:  'blue',
};

