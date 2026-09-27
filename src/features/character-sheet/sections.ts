import { parseLocationBody } from '@/data/location-tracking/esi-projection';
import { LOCATION_SYNC_SCOPES } from '@/data/location-tracking/sync-eligibility';
import {
  parseAttributesBody,
  parseCharacterBody,
  parseClonesBody,
  parseImplantsBody,
  parseCurrentShipBody,
  parseOnlineStatusBody,
  parseWalletBody,
} from './esi-projection';
import { digestJournalBody } from './plan';
import type { SheetSectionKey, SheetSectionSpec, SheetTier } from './types';

export const TIER_ENTRY = {
  live: 'character_sheet_live',
  hourly: 'character_sheet_hourly',
  daily: 'character_sheet_daily',
} as const satisfies Record<SheetTier, string>;

const WALLET_SCOPE = 'esi-wallet.read_character_wallet.v1';

export const SHEET_SECTION_KEYS = [
  'profile',
  'status',
  'attributes',
  'implants',
  'clones',
  'wallet',
  'journal',
  'structures',
] as const satisfies readonly SheetSectionKey[];

/** The closed section table. Adding a section is one row here plus one ESI path in the composition port. */
export const SHEET_SECTIONS: { [K in SheetSectionKey]: SheetSectionSpec<K> } = {
  profile: {
    key: 'profile',
    tier: 'daily',
    scopes: [],
    parts: { character: { endpoint: 'character', parse: parseCharacterBody } },
  },
  status: {
    key: 'status',
    tier: 'live',
    scopes: LOCATION_SYNC_SCOPES,
    parts: {
      location: { endpoint: 'location', parse: parseLocationBody },
      ship: { endpoint: 'ship', parse: parseCurrentShipBody },
      online: { endpoint: 'online', parse: parseOnlineStatusBody },
    },
  },
  attributes: {
    key: 'attributes',
    tier: 'live',
    scopes: ['esi-skills.read_skills.v1'],
    parts: { attributes: { endpoint: 'attributes', parse: parseAttributesBody } },
  },
  implants: {
    key: 'implants',
    tier: 'live',
    scopes: ['esi-clones.read_implants.v1'],
    parts: { implants: { endpoint: 'implants', parse: parseImplantsBody } },
  },
  clones: {
    key: 'clones',
    tier: 'live',
    scopes: ['esi-clones.read_clones.v1'],
    parts: { clones: { endpoint: 'clones', parse: parseClonesBody } },
  },
  wallet: {
    key: 'wallet',
    tier: 'live',
    scopes: [WALLET_SCOPE],
    parts: { balance: { endpoint: 'wallet', parse: parseWalletBody } },
  },
  journal: {
    key: 'journal',
    tier: 'hourly',
    scopes: [WALLET_SCOPE],
    parts: { journal: { endpoint: 'journal', parse: digestJournalBody } },
  },
  structures: {
    key: 'structures',
    tier: 'hourly',
    scopes: ['esi-universe.read_structures.v1'],
    parts: 'structures',
  },
};
