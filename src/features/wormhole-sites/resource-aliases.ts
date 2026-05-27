// Strict, hand-authored Sheet→SDE alias map. The ingest script consults this
// dictionary to resolve each wormhole-site resource_name to an Eve type ID.
//
// Rules:
// - Keys are the Sheet's resource_name, normalized to lowercase + trimmed.
// - Values are the canonical SDE type name. Ingest resolves the name via
//   `getTypesByNames` (case-insensitive, published-wins) from eve-data.
// - Every ore and gas entry points to the COMPRESSED SDE variant — that's
//   what wormhole haulers actually sell in Jita, so the 5%-percentile buy
//   reflects what a seller realistically receives.
// - Sheet typos are encoded verbatim as keys with the correct SDE name as
//   the value (e.g. "luminous kermite" → "Compressed Luminous Kernite",
//   "vivid hemorite" → "Compressed Vivid Hemorphite"). EVE item naming is
//   pedantic — fuzzy matching is forbidden, so each typo is hand-mapped.
// - Names absent from this map resolve to typeId = null; the row continues
//   rendering the Sheet's totalIsk (fallback path).

const RESOURCE_ALIASES: Record<string, string> = {
  // ── Gas ─────────────────────────────────────────────────────────────────
  'fullerite-c28':  'Compressed Fullerite-C28',
  'fullerite-c32':  'Compressed Fullerite-C32',
  'fullerite-c50':  'Compressed Fullerite-C50',
  'fullerite-c60':  'Compressed Fullerite-C60',
  'fullerite-c70':  'Compressed Fullerite-C70',
  'fullerite-c72':  'Compressed Fullerite-C72',
  'fullerite-c84':  'Compressed Fullerite-C84',
  'fullerite-c320': 'Compressed Fullerite-C320',
  'fullerite-c540': 'Compressed Fullerite-C540',

  // ── Standard ore ────────────────────────────────────────────────────────
  'veldspar':    'Compressed Veldspar',
  'scordite':    'Compressed Scordite',
  'pyroxeres':   'Compressed Pyroxeres',
  'plagioclase': 'Compressed Plagioclase',
  'omber':       'Compressed Omber',
  'kernite':     'Compressed Kernite',
  'jaspet':      'Compressed Jaspet',
  'hemorphite':  'Compressed Hemorphite',
  'hedbergite':  'Compressed Hedbergite',
  'gneiss':      'Compressed Gneiss',
  'dark ochre':  'Compressed Dark Ochre',
  'crokite':     'Compressed Crokite',
  'spodumain':   'Compressed Spodumain',
  'bistot':      'Compressed Bistot',
  'arkonor':     'Compressed Arkonor',
  'mercoxit':    'Compressed Mercoxit',

  // ── Ore variants (higher-yield asteroid types) ──────────────────────────
  'concentrated veldspar': 'Compressed Concentrated Veldspar',
  'massive scordite':      'Compressed Massive Scordite',
  'solid pyroxeres':       'Compressed Solid Pyroxeres',
  'viscous pyroxeres':     'Compressed Viscous Pyroxeres',
  'fiery kernite':         'Compressed Fiery Kernite',
  'pure jaspet':           'Compressed Pure Jaspet',
  'pristine jaspet':       'Compressed Pristine Jaspet',
  'radiant hemorphite':    'Compressed Radiant Hemorphite',
  'prismatic gneiss':      'Compressed Prismatic Gneiss',
  'obsidian ochre':        'Compressed Obsidian Ochre',
  'crystalline crokite':   'Compressed Crystalline Crokite',
  'gleaming spodumain':    'Compressed Gleaming Spodumain',
  'monoclinic bistot':     'Compressed Monoclinic Bistot',
  'prime arkonor':         'Compressed Prime Arkonor',
  'vitreous mercoxit':     'Compressed Vitreous Mercoxit',

  // ── Ice products (appear in ore-tab anomalies) ──────────────────────────
  'dark glitter':           'Compressed Dark Glitter',
  'gelidus':                'Compressed Gelidus',
  'glare crust':            'Compressed Glare Crust',
  'krystallos':             'Compressed Krystallos',
  'smooth glacial mass':    'Compressed Smooth Glacial Mass',
  'thick blue ice':         'Compressed Thick Blue Ice',
  'enriched clear icicle':  'Compressed Enriched Clear Icicle',
  'pristine white glaze':   'Compressed Pristine White Glaze',
};

export function resolveAlias(sheetName: string): string | null {
  return RESOURCE_ALIASES[sheetName.trim().toLowerCase()] ?? null;
}
