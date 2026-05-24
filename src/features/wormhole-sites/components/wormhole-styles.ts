import type { PillTone } from '@/components/ui/pill';
import type { ChipTone } from '@/components/ui/chip';
import type { DotTone } from '@/components/ui/dot';
import type { SiteType, WormholeClass } from '../types';

/**
 * Domain → UI tone mappings. The only file in the codebase where
 * "WEB is blue" or "C5 is red" lives. Components in `src/components/ui/`
 * stay domain-agnostic; this file translates wormhole concepts into the
 * primitive layer's abstract tones.
 */

export const CLASS_TONE: Record<WormholeClass, PillTone> = {
  C1: 'green',
  C2: 'green-strong',
  C3: 'orange',
  C4: 'magenta',
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

export const SITE_TYPE_LABEL: Record<SiteType, string> = {
  combat: 'Combat',
  ore:    'Ore',
  gas:    'Gas',
  relic:  'Relic',
  data:   'Data',
};

/** EWAR keys on Wave / Npc rows → chip color. */
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

/** Trigger labels (free-text in DB) → trigger chip is always orange. */
export const TRIGGER_CHIP_TONE: ChipTone = 'orange';

/** Hackable-container site types → bullet-dot abstract tone. The Dot
 *  primitive itself only knows colors; this is where "relic = orange,
 *  data = blue" lives. */
export const HACK_DOT_TONE: Record<'relic' | 'data', DotTone> = {
  relic: 'orange',
  data:  'blue',
};

/** DPS thresholds → text color class. Thresholds match the prototype's
 *  intuitive bands; tweak in one place if balancing changes. */
export type DpsTier = 'low' | 'mid' | 'high';

export function dpsTier(dps: number | null | undefined): DpsTier {
  if (!dps) return 'low';
  if (dps >= 200) return 'high';
  if (dps >= 50) return 'mid';
  return 'low';
}

export const DPS_TIER_CLASS: Record<DpsTier, string> = {
  low:  'text-[#3dd68c]',
  mid:  'text-[#ffaa22]',
  high: 'text-[#ff5555]',
};

/** Scan-class pill ("Cosmic Anomaly" vs "Cosmic Signature"). */
export const SCAN_PILL_LABEL: Record<'anomaly' | 'signature', string> = {
  anomaly:   'Cosmic Anomaly',
  signature: 'Cosmic Signature',
};

/** Site type → which scan-class pill it uses. */
export const SITE_TYPE_SCAN: Record<SiteType, 'anomaly' | 'signature'> = {
  combat: 'anomaly',
  ore:    'signature',
  gas:    'signature',
  relic:  'signature',
  data:   'signature',
};
