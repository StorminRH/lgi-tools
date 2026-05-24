import {
  SIGNATURE_LABELS,
  type SignatureLabel,
  type SiteType,
  type WormholeClass,
} from './schema';
import { SIGNATURE_TO_SITE_TYPE, type SheetTab } from './sheet-source';

// One site = one block in the Sheet. waves/resources are children.
export type ParsedSite = {
  sourceTab: string;
  name: string;
  signatureLabel: SignatureLabel;
  siteType: SiteType;
  wormholeClass: WormholeClass | null;
  blueLootIsk: number | null;
  iskPerEhp: number | null;
  resourceValueIsk: number | null;
  waves: ParsedWave[];
  resources: ParsedResource[];
};

type ParsedWave = {
  waveNumber: number;
  waveLabel: string;
  ewScram: number | null;
  ewWeb: number | null;
  ewNeut: number | null;
  ewRrep: number | null;
  dpsTotal: number | null;
  alphaTotal: number | null;
  ehpTotal: number | null;
  npcs: ParsedNpc[];
};

type ParsedNpc = {
  orderInWave: number;
  triggerLabel: string | null;
  quantity: number;
  sleeperName: string;
  sleeperClassCode: string;
  scram: number | null;
  web: number | null;
  neut: number | null;
  rrep: number | null;
  sig: number | null;
  speed: number | null;
  distance: number | null;
  velocity: number | null;
  dps: number | null;
  alpha: number | null;
  ehp: number | null;
};

type ParsedResource = {
  orderInSite: number;
  resourceKind: 'gas' | 'ore';
  resourceName: string;
  units: number | null;
  volumeM3: number | null;
  iskPerM3: number | null;
  totalIsk: number | null;
};

// RFC 4180 CSV parser. The Sheet emits "" as an escaped quote inside a quoted field.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      cur.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // trailing field/row
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

function cell(row: string[], idx: number): string {
  return (row[idx] ?? '').trim();
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => c.trim() === '');
}

function parseMoney(s: string): number | null {
  const v = s.trim().replace(/[$,]/g, '');
  if (v === '' || v === '#ERROR!') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseInt0(s: string): number | null {
  const v = s.trim().replace(/,/g, '');
  if (v === '' || v === '-' || v === '#ERROR!') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function isInteger(s: string): boolean {
  const v = s.trim().replace(/,/g, '');
  if (v === '') return false;
  return /^-?\d+$/.test(v);
}

const TAB_TITLES = new Set([
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6',
  'Gas Signatures', 'Ore Signatures',
]);

const SIGNATURE_SET = new Set<string>(SIGNATURE_LABELS);

export function parseSheetTab(csvText: string, tab: SheetTab): ParsedSite[] {
  const rows = parseCsv(csvText);
  const sites: ParsedSite[] = [];

  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (isBlankRow(row)) { i++; continue; }

    const b = cell(row, 1);
    if (!b) { i++; continue; }
    if (TAB_TITLES.has(b)) { i++; continue; }

    // The next non-blank row's col1 must be a signature label to confirm a site-block start.
    let k = i + 1;
    while (k < rows.length && isBlankRow(rows[k])) k++;
    if (k >= rows.length) break;
    const sigRow = rows[k];
    const sig = cell(sigRow, 1);
    if (!SIGNATURE_SET.has(sig)) {
      // Not a site block — skip narrative rows (e.g. C5 "DTA = Ship that triggers...")
      i++;
      continue;
    }

    const name = b;
    const signatureLabel = sig as SignatureLabel;
    const siteType = SIGNATURE_TO_SITE_TYPE[signatureLabel];
    const blueLootIsk = parseMoney(cell(sigRow, 18));
    // col 17 of the column-header row holds "ISK/EHP", col 18 the per-isk value
    const headerRow = rows[k + 1];
    const iskPerEhp = headerRow ? parseInt0(cell(headerRow, 18).replace(/^\$/, '')) : null;

    const site: ParsedSite = {
      sourceTab: tab.label,
      name,
      signatureLabel,
      siteType,
      wormholeClass: tab.wormholeClass,
      blueLootIsk,
      iskPerEhp,
      resourceValueIsk: null,
      waves: [],
      resources: [],
    };

    // Body starts at k+2 (after sig row + column-header row).
    let j = k + 2;
    let currentWave: ParsedWave | null = null;
    let waveAutoNum = 0;
    let inResourceSection = false;

    while (j < rows.length) {
      const r = rows[j];

      // Two consecutive blank rows = block end. Single blank = continue.
      if (isBlankRow(r)) {
        const next = rows[j + 1];
        if (!next || isBlankRow(next)) break;
        j++;
        continue;
      }

      const c1 = cell(r, 1);
      const c2 = cell(r, 2);
      const c3 = cell(r, 3);
      const c4 = cell(r, 4);

      // If the row looks like a new site start (col1 is a name and the next non-blank
      // row's col1 is a signature label), end the current block here. Guards against
      // free-form annotation rows like ",,,,Total m3:,..." that otherwise prevent the
      // two-blank-rows heuristic from firing.
      if (c1 && !TAB_TITLES.has(c1) && !c1.startsWith('Wave ') && c1 !== 'Defenders'
          && c1 !== 'Gas' && c1 !== 'Ore' && c2 === '') {
        let p = j + 1;
        while (p < rows.length && isBlankRow(rows[p])) p++;
        if (p < rows.length && SIGNATURE_SET.has(cell(rows[p], 1))) break;
      }

      // Resource section header: ",,,,Units,m3,ISK/m3,ISK,..."
      if (!c1 && !c2 && !c3 && c4 === 'Units') {
        inResourceSection = true;
        j++;
        continue;
      }

      // Resource section marker: ",Gas,..." or ",Ore,..."
      if (inResourceSection && (c1 === 'Gas' || c1 === 'Ore')) {
        j++;
        continue;
      }

      // Resource data row: col3 is resource name, col4 numeric.
      if (inResourceSection && !c1 && !c2 && c3) {
        const kind = tab.resourceKind ?? (c1 === 'Ore' ? 'ore' : 'gas');
        site.resources.push({
          orderInSite: site.resources.length,
          resourceKind: kind,
          resourceName: c3,
          units: parseInt0(c4),
          volumeM3: parseInt0(cell(r, 5)),
          iskPerM3: parseMoney(cell(r, 6)),
          totalIsk: parseMoney(cell(r, 7)),
        });
        j++;
        continue;
      }

      // Wave summary row: col1 starts with "Wave" or equals "Defenders", and col2 is empty.
      const isWaveSummary =
        (c1.startsWith('Wave ') || c1 === 'Defenders') && c2 === '';
      if (isWaveSummary) {
        waveAutoNum += 1;
        const isDefenders = c1 === 'Defenders';
        const waveNumber = isDefenders ? 0 : parseInt0(c1.replace(/^Wave\s+/, '')) ?? waveAutoNum;
        currentWave = {
          waveNumber,
          waveLabel: c1,
          ewScram: parseInt0(cell(r, 5)),
          ewWeb: parseInt0(cell(r, 6)),
          ewNeut: parseInt0(cell(r, 7)),
          ewRrep: parseInt0(cell(r, 8)),
          dpsTotal: parseInt0(cell(r, 13)),
          alphaTotal: parseInt0(cell(r, 14)),
          ehpTotal: parseInt0(cell(r, 15)),
          npcs: [],
        };
        site.waves.push(currentWave);
        j++;
        continue;
      }

      // NPC row: col2 is an integer quantity.
      if (isInteger(c2) && currentWave) {
        const triggerLabel = c1 === '' ? null : c1;
        currentWave.npcs.push({
          orderInWave: currentWave.npcs.length,
          triggerLabel,
          quantity: parseInt0(c2)!,
          sleeperName: c3,
          sleeperClassCode: c4,
          scram: parseInt0(cell(r, 5)),
          web: parseInt0(cell(r, 6)),
          neut: parseInt0(cell(r, 7)),
          rrep: parseInt0(cell(r, 8)),
          sig: parseInt0(cell(r, 9)),
          speed: parseInt0(cell(r, 10)),
          distance: parseInt0(cell(r, 11)),
          velocity: parseInt0(cell(r, 12)),
          dps: parseInt0(cell(r, 13)),
          alpha: parseInt0(cell(r, 14)),
          ehp: parseInt0(cell(r, 15)),
        });
        // The "Gas Value" / "Ore Value" total piggybacks on an NPC row in cols 17/18.
        const tag = cell(r, 17);
        if (tag === 'Gas Value' || tag === 'Ore Value') {
          site.resourceValueIsk = parseMoney(cell(r, 18));
        }
        j++;
        continue;
      }

      // Unknown row — advance to avoid an infinite loop.
      j++;
    }

    // Recompute wave-level EWAR from per-NPC data — sheet summary rows may
    // omit or misalign neut/rrep counts, so derive from ground truth.
    for (const wave of site.waves) {
      const totals = wave.npcs.reduce(
        (acc, n) => ({
          ewScram: acc.ewScram + (n.scram ?? 0),
          ewWeb:   acc.ewWeb   + (n.web   ?? 0),
          ewNeut:  acc.ewNeut  + (n.neut  ?? 0),
          ewRrep:  acc.ewRrep  + (n.rrep  ?? 0),
        }),
        { ewScram: 0, ewWeb: 0, ewNeut: 0, ewRrep: 0 },
      );
      wave.ewScram = totals.ewScram || null;
      wave.ewWeb   = totals.ewWeb   || null;
      wave.ewNeut  = totals.ewNeut  || null;
      wave.ewRrep  = totals.ewRrep  || null;
    }

    sites.push(site);
    i = j;
  }

  return sites;
}
