/*
 * One-shot seed extractor.
 *
 *   1. Dumps the current local DB rows (sites/waves/npcs/site_resources)
 *      and the audit-derived rows (escalations parsed from Drifter +
 *      Avenger CSVs; sleeper_archetypes parsed from Calculations CSV)
 *      to JSON snapshots under sheet-audit/seed-source/.
 *   2. Transposes the raw Sleeper Data + Missile Data tabs into
 *      attribute-keyed JSON (typeId → { attributeId: value }) as
 *      reference for the future native-recompute phase.
 *   3. Generates a Drizzle seed migration (raw SQL with INSERT … ON
 *      CONFLICT DO NOTHING) under drizzle/0006_historical_seed.sql so
 *      a fresh DB can be rebuilt with `pnpm db:migrate` alone.
 *
 * Run from the repo root, against a populated local DB:
 *   pnpm tsx sheet-audit/extract-seed.ts
 *
 * Intended to run ONCE. Re-running is safe (file overwrite) but the
 * generated migration is meant to be committed and never regenerated
 * unless the upstream Sheet snapshot is intentionally refreshed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

import { parseCsv } from '../src/features/wormhole-sites/sheet-parser';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const SEED_DIR = join(HERE, 'seed-source');
const MIGRATION_PATH = join(REPO_ROOT, 'drizzle', '0006_historical_seed.sql');

loadEnv({ path: join(REPO_ROOT, '.env.local') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL missing — populate .env.local first.');
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

/* ----------------------------- helpers --------------------------------- */

function sqlString(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  return `'${v.replace(/'/g, "''")}'`;
}

function sqlNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v as number)) return 'NULL';
  return String(v);
}

function parseMoney(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '#N/A' || cleaned === '#ERROR!') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePercent(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[%,\s]/g, '');
  if (!cleaned || cleaned === '#N/A' || cleaned === '#ERROR!') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseInteger(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '#N/A' || cleaned === '#ERROR!') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/* --------------------- existing-DB row dumps --------------------------- */

type SiteRow = {
  id: number; source_tab: string; name: string; site_type: string;
  signature_label: string; wormhole_class: string | null;
  blue_loot_isk: string | null; isk_per_ehp: number | null;
  resource_value_isk: string | null;
  created_at: Date; updated_at: Date;
};

type WaveRow = {
  id: number; site_id: number; wave_number: number; wave_label: string;
  ew_scram: number | null; ew_web: number | null;
  ew_neut: number | null; ew_rrep: number | null;
  dps_total: number | null; alpha_total: number | null; ehp_total: number | null;
};

type NpcRow = {
  id: number; wave_id: number; order_in_wave: number;
  trigger_label: string | null; quantity: number;
  sleeper_name: string; sleeper_class_code: string;
  scram: number | null; web: number | null; neut: number | null; rrep: number | null;
  sig: number | null; speed: number | null; distance: number | null; velocity: number | null;
  dps: number | null; alpha: number | null; ehp: number | null;
};

type ResourceRow = {
  id: number; site_id: number; order_in_site: number;
  resource_kind: string; resource_name: string;
  units: string | null; volume_m3: string | null;
  isk_per_m3: number | null; total_isk: string | null;
  type_id: number | null;
};

async function dumpDb() {
  const sites = await sql<SiteRow[]>`SELECT * FROM sites ORDER BY id`;
  const waves = await sql<WaveRow[]>`SELECT * FROM waves ORDER BY id`;
  const npcs = await sql<NpcRow[]>`SELECT * FROM npcs ORDER BY id`;
  const resources = await sql<ResourceRow[]>`SELECT * FROM site_resources ORDER BY id`;
  return { sites, waves, npcs, resources };
}

/* ------------------- parse Calculations → archetypes -------------------- */

type Archetype = {
  typeId: number; name: string; blueLootIsk: number | null;
  turretDps: number | null; turretAlpha: number | null;
  missileDps: number | null; missileAlpha: number | null;
  totalDps: number | null; totalAlpha: number | null;
  shieldHp: number | null;
  shieldResEm: number | null; shieldResExp: number | null;
  shieldResKin: number | null; shieldResTherm: number | null;
  armorHp: number | null;
  armorResEm: number | null; armorResExp: number | null;
  armorResKin: number | null; armorResTherm: number | null;
  structureHp: number | null; ehp: number | null;
  sigRadius: number | null; maxVelocity: number | null;
  orbitDistance: number | null; orbitVelocity: number | null;
  scram: number | null; web: number | null;
  neutAmount: number | null; neutDuration: number | null; neutCount: number | null;
  rrepAmount: number | null; rrepDuration: number | null; rrepCount: number | null;
};

async function parseArchetypes(): Promise<Archetype[]> {
  const csv = await readFile(join(HERE, 'raw', '360740101-calculations.csv'), 'utf8');
  const rows = parseCsv(csv);
  // row 0 = section headers; row 1 = column names; data starts at row 2
  const out: Archetype[] = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const typeId = parseInteger(row[0]);
    if (typeId === null) continue;
    out.push({
      typeId,
      name: (row[1] ?? '').trim(),
      blueLootIsk: parseMoney(row[2]),
      turretDps: parseInteger(row[13]),
      turretAlpha: parseInteger(row[14]),
      missileDps: parseInteger(row[33]),
      missileAlpha: parseInteger(row[34]),
      totalDps: parseInteger(row[35]),
      totalAlpha: parseInteger(row[36]),
      shieldHp: parseInteger(row[37]),
      shieldResEm: parsePercent(row[38]),
      shieldResExp: parsePercent(row[39]),
      shieldResKin: parsePercent(row[40]),
      shieldResTherm: parsePercent(row[41]),
      armorHp: parseInteger(row[42]),
      armorResEm: parsePercent(row[43]),
      armorResExp: parsePercent(row[44]),
      armorResKin: parsePercent(row[45]),
      armorResTherm: parsePercent(row[46]),
      structureHp: parseInteger(row[47]),
      ehp: parseInteger(row[48]),
      sigRadius: parseInteger(row[49]),
      maxVelocity: parseInteger(row[50]),
      orbitDistance: parseInteger(row[51]),
      orbitVelocity: parseInteger(row[52]),
      scram: parseInteger(row[53]),
      web: parsePercent(row[54]),
      neutAmount: parseInteger(row[55]),
      neutDuration: parseInteger(row[56]),
      neutCount: parseInteger(row[58]),
      rrepAmount: parseInteger(row[59]),
      rrepDuration: parseInteger(row[60]),
      rrepCount: parseInteger(row[61]),
    });
  }
  return out;
}

/* ----------------- parse Drifter / Avenger → escalations --------------- */

type Escalation = {
  name: string; typeId: number | null; classScope: string; triggerNotes: string;
  blueLootIsk: number | null; iskPerEhpMin: number | null; iskPerEhpMax: number | null;
  shieldHp: number | null;
  shieldResEm: number | null; shieldResExp: number | null;
  shieldResKin: number | null; shieldResTherm: number | null;
  armorHp: number | null;
  armorResEm: number | null; armorResExp: number | null;
  armorResKin: number | null; armorResTherm: number | null;
  structureHp: number | null;
  ehpMin: number | null; ehpMax: number | null;
  dps: number | null; sig: number | null; speed: number | null;
  distance: number | null; velocity: number | null;
  scram: number | null; web: number | null; neut: number | null; rrep: number | null;
};

function findResistRow(rows: string[][], label: string): string[] | undefined {
  return rows.find((r) => (r[1] ?? '').trim().toLowerCase() === label.toLowerCase());
}

function parseEscalationFromDataRow(rows: string[][], dataRowIdx: number, sharedNotes: string, defaults: { classScope: string; typeIdByName: Map<string, number> }): Escalation | null {
  const dataRow = rows[dataRowIdx];
  const name = (dataRow[1] ?? '').trim();
  if (!defaults.typeIdByName.has(name)) return null;

  // Blue Loot label + $value live on the HEADER row immediately above the
  // data row (the Sheet renders them as a small top-right callout).
  const headerRow = rows[dataRowIdx - 1] ?? [];
  const blueLootLabel = (headerRow[16] ?? '').trim();
  const blueLootIsk = blueLootLabel === 'Blue Loot' ? parseMoney(headerRow[17]) : null;

  // ISK/EHP Min and Max live in the following 1–4 rows in cols 16/17.
  let iskPerEhpMin: number | null = null;
  let iskPerEhpMax: number | null = null;
  for (let k = dataRowIdx; k < Math.min(dataRowIdx + 5, rows.length); k++) {
    const r = rows[k];
    if (!r) continue;
    const lbl = (r[16] ?? '').trim();
    const val = parseMoney(r[17]);
    if (lbl === 'ISK/EHP Min') iskPerEhpMin = val;
    if (lbl === 'ISK/EHP Max') iskPerEhpMax = val;
  }

  // Resistance/HP block: rows tagged Shield/Armor/Structure in col[1]
  // somewhere in the next ~15 rows.
  const window = rows.slice(dataRowIdx, dataRowIdx + 15);
  const shield = findResistRow(window, 'Shield');
  const armor = findResistRow(window, 'Armor');
  const structure = findResistRow(window, 'Structure');

  // The totals row immediately follows the structure row in the same
  // window; min/max sums sit in cols 8 and 10.
  let ehpMin: number | null = null;
  let ehpMax: number | null = null;
  if (structure) {
    const structureIdx = window.indexOf(structure);
    const totalsRow = window[structureIdx + 1];
    if (totalsRow) {
      ehpMin = parseInteger(totalsRow[8]);
      ehpMax = parseInteger(totalsRow[10]);
    }
  }

  return {
    name,
    typeId: defaults.typeIdByName.get(name) ?? null,
    classScope: defaults.classScope,
    triggerNotes: sharedNotes,
    blueLootIsk,
    iskPerEhpMin,
    iskPerEhpMax,
    shieldHp: shield ? parseInteger(shield[2]) : null,
    shieldResEm: shield ? parsePercent(shield[4]) : null,
    shieldResExp: shield ? parsePercent(shield[5]) : null,
    shieldResKin: shield ? parsePercent(shield[6]) : null,
    shieldResTherm: shield ? parsePercent(shield[7]) : null,
    armorHp: armor ? parseInteger(armor[2]) : null,
    armorResEm: armor ? parsePercent(armor[4]) : null,
    armorResExp: armor ? parsePercent(armor[5]) : null,
    armorResKin: armor ? parsePercent(armor[6]) : null,
    armorResTherm: armor ? parsePercent(armor[7]) : null,
    structureHp: structure ? parseInteger(structure[2]) : null,
    ehpMin,
    ehpMax,
    dps: parseInteger(dataRow[14]),
    sig: parseInteger(dataRow[8]),
    speed: parseInteger(dataRow[9]),
    distance: parseInteger(dataRow[11]),
    velocity: parseInteger(dataRow[13]),
    scram: parseInteger(dataRow[4]),
    web: parseInteger(dataRow[5]),
    neut: parseInteger(dataRow[6]),
    rrep: parseInteger(dataRow[7]),
  };
}

function collectSharedNotes(rows: string[][], typeIdByName: Map<string, number>): string {
  // Tab-level prose: col[1] text from the rows above the first "Effect(s)"
  // header row. Skips the bare title row (col[1] equals one of the known
  // escalation names with no other data on the row).
  const notes: string[] = [];
  for (const r of rows) {
    if (!r) continue;
    const headerSentinel = (r[4] ?? '').trim();
    if (headerSentinel === 'Effect(s)') break;
    const cellText = (r[1] ?? '').trim();
    if (!cellText) continue;
    if (typeIdByName.has(cellText)) continue; // skip the title row
    notes.push(cellText);
  }
  return notes.join('\n');
}

async function parseEscalations(): Promise<Escalation[]> {
  const typeIdByName = new Map<string, number>([
    ['Drifter Response Battleship', 37473],
    ['Drifter Recon Battleship', 86498],
    ['Upgraded Avenger', 37472],
  ]);

  const drifter = parseCsv(await readFile(join(HERE, 'raw', '1813193533-drifter.csv'), 'utf8'));
  const avenger = parseCsv(await readFile(join(HERE, 'raw', '1160985461-avenger.csv'), 'utf8'));

  const drifterNotes = collectSharedNotes(drifter, typeIdByName);
  const avengerNotes = collectSharedNotes(avenger, typeIdByName);

  // A data row is any row whose col[1] is a known escalation name AND
  // col[2] is numeric (the quantity). This catches every occurrence,
  // regardless of whether a block has an above-the-fold name header.
  function findDataRows(rows: string[][]): number[] {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const name = (r[1] ?? '').trim();
      if (!typeIdByName.has(name)) continue;
      if (parseInteger(r[2]) === null) continue;
      out.push(i);
    }
    return out;
  }

  const escalations: Escalation[] = [];
  for (const idx of findDataRows(drifter)) {
    const e = parseEscalationFromDataRow(drifter, idx, drifterNotes, { classScope: 'C5/C6', typeIdByName });
    if (e) escalations.push(e);
  }
  for (const idx of findDataRows(avenger)) {
    const e = parseEscalationFromDataRow(avenger, idx, avengerNotes, { classScope: 'C5/C6', typeIdByName });
    if (e) escalations.push(e);
  }
  return escalations;
}

/* --------------- transpose Sleeper / Missile Data tabs ----------------- */

async function transposeAttributeTab(path: string): Promise<Record<string, Record<string, number | string>>> {
  const rows = parseCsv(await readFile(path, 'utf8'));
  if (rows.length === 0) return {};
  const header = rows[0];
  const out: Record<string, Record<string, number | string>> = {};
  // Columns come in (typeId, name) pairs. For column-pair (2k, 2k+1):
  //   header[2k] = typeId, header[2k+1] = name
  //   data rows have (attributeId, value) at the same column pair.
  for (let col = 0; col + 1 < header.length; col += 2) {
    const typeId = (header[col] ?? '').trim();
    const name = (header[col + 1] ?? '').trim();
    if (!typeId || !name) continue;
    const attrs: Record<string, number | string> = { name };
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const attrId = (row[col] ?? '').trim();
      const val = (row[col + 1] ?? '').trim();
      if (!attrId || !val) continue;
      const numericVal = Number(val);
      attrs[attrId] = Number.isFinite(numericVal) ? numericVal : val;
    }
    out[typeId] = attrs;
  }
  return out;
}

/* ---------------------------- SQL builders ----------------------------- */

function buildSiteInsert(sites: SiteRow[]): string {
  if (sites.length === 0) return '';
  const values = sites.map((s) =>
    `(${s.id}, ${sqlString(s.source_tab)}, ${sqlString(s.name)}, ${sqlString(s.site_type)}, ${sqlString(s.signature_label)}, ${sqlString(s.wormhole_class)}, ${sqlNum(s.blue_loot_isk === null ? null : Number(s.blue_loot_isk))}, ${sqlNum(s.isk_per_ehp)}, ${sqlNum(s.resource_value_isk === null ? null : Number(s.resource_value_isk))}, ${sqlString(s.created_at.toISOString())}, ${sqlString(s.updated_at.toISOString())})`
  ).join(',\n  ');
  return `INSERT INTO sites (id, source_tab, name, site_type, signature_label, wormhole_class, blue_loot_isk, isk_per_ehp, resource_value_isk, created_at, updated_at) VALUES\n  ${values}\nON CONFLICT (source_tab, name) DO NOTHING;`;
}

function buildWaveInsert(waves: WaveRow[]): string {
  if (waves.length === 0) return '';
  const values = waves.map((w) =>
    `(${w.id}, ${w.site_id}, ${w.wave_number}, ${sqlString(w.wave_label)}, ${sqlNum(w.ew_scram)}, ${sqlNum(w.ew_web)}, ${sqlNum(w.ew_neut)}, ${sqlNum(w.ew_rrep)}, ${sqlNum(w.dps_total)}, ${sqlNum(w.alpha_total)}, ${sqlNum(w.ehp_total)})`
  ).join(',\n  ');
  return `INSERT INTO waves (id, site_id, wave_number, wave_label, ew_scram, ew_web, ew_neut, ew_rrep, dps_total, alpha_total, ehp_total) VALUES\n  ${values}\nON CONFLICT (site_id, wave_number) DO NOTHING;`;
}

function buildNpcInsert(npcs: NpcRow[]): string {
  if (npcs.length === 0) return '';
  const values = npcs.map((n) =>
    `(${n.id}, ${n.wave_id}, ${n.order_in_wave}, ${sqlString(n.trigger_label)}, ${n.quantity}, ${sqlString(n.sleeper_name)}, ${sqlString(n.sleeper_class_code)}, ${sqlNum(n.scram)}, ${sqlNum(n.web)}, ${sqlNum(n.neut)}, ${sqlNum(n.rrep)}, ${sqlNum(n.sig)}, ${sqlNum(n.speed)}, ${sqlNum(n.distance)}, ${sqlNum(n.velocity)}, ${sqlNum(n.dps)}, ${sqlNum(n.alpha)}, ${sqlNum(n.ehp)})`
  ).join(',\n  ');
  return `INSERT INTO npcs (id, wave_id, order_in_wave, trigger_label, quantity, sleeper_name, sleeper_class_code, scram, web, neut, rrep, sig, speed, distance, velocity, dps, alpha, ehp) VALUES\n  ${values}\nON CONFLICT (wave_id, order_in_wave) DO NOTHING;`;
}

function buildResourceInsert(resources: ResourceRow[]): string {
  if (resources.length === 0) return '';
  const values = resources.map((r) =>
    `(${r.id}, ${r.site_id}, ${r.order_in_site}, ${sqlString(r.resource_kind)}, ${sqlString(r.resource_name)}, ${sqlNum(r.units === null ? null : Number(r.units))}, ${sqlNum(r.volume_m3 === null ? null : Number(r.volume_m3))}, ${sqlNum(r.isk_per_m3)}, ${sqlNum(r.total_isk === null ? null : Number(r.total_isk))}, ${sqlNum(r.type_id)})`
  ).join(',\n  ');
  return `INSERT INTO site_resources (id, site_id, order_in_site, resource_kind, resource_name, units, volume_m3, isk_per_m3, total_isk, type_id) VALUES\n  ${values}\nON CONFLICT (site_id, order_in_site) DO NOTHING;`;
}

function buildEscalationInsert(escalations: Escalation[]): string {
  if (escalations.length === 0) return '';
  const values = escalations.map((e) =>
    `(${sqlString(e.name)}, ${sqlNum(e.typeId)}, ${sqlString(e.classScope)}, ${sqlString(e.triggerNotes)}, ${sqlNum(e.blueLootIsk)}, ${sqlNum(e.iskPerEhpMin)}, ${sqlNum(e.iskPerEhpMax)}, ${sqlNum(e.shieldHp)}, ${sqlNum(e.shieldResEm)}, ${sqlNum(e.shieldResExp)}, ${sqlNum(e.shieldResKin)}, ${sqlNum(e.shieldResTherm)}, ${sqlNum(e.armorHp)}, ${sqlNum(e.armorResEm)}, ${sqlNum(e.armorResExp)}, ${sqlNum(e.armorResKin)}, ${sqlNum(e.armorResTherm)}, ${sqlNum(e.structureHp)}, ${sqlNum(e.ehpMin)}, ${sqlNum(e.ehpMax)}, ${sqlNum(e.dps)}, ${sqlNum(e.sig)}, ${sqlNum(e.speed)}, ${sqlNum(e.distance)}, ${sqlNum(e.velocity)}, ${sqlNum(e.scram)}, ${sqlNum(e.web)}, ${sqlNum(e.neut)}, ${sqlNum(e.rrep)})`
  ).join(',\n  ');
  return `INSERT INTO escalations (name, type_id, class_scope, trigger_notes, blue_loot_isk, isk_per_ehp_min, isk_per_ehp_max, shield_hp, shield_res_em, shield_res_exp, shield_res_kin, shield_res_therm, armor_hp, armor_res_em, armor_res_exp, armor_res_kin, armor_res_therm, structure_hp, ehp_min, ehp_max, dps, sig, speed, distance, velocity, scram, web, neut, rrep) VALUES\n  ${values}\nON CONFLICT (name) DO NOTHING;`;
}

function buildArchetypeInsert(archetypes: Archetype[]): string {
  if (archetypes.length === 0) return '';
  const values = archetypes.map((a) =>
    `(${a.typeId}, ${sqlString(a.name)}, ${sqlNum(a.blueLootIsk)}, ${sqlNum(a.turretDps)}, ${sqlNum(a.turretAlpha)}, ${sqlNum(a.missileDps)}, ${sqlNum(a.missileAlpha)}, ${sqlNum(a.totalDps)}, ${sqlNum(a.totalAlpha)}, ${sqlNum(a.shieldHp)}, ${sqlNum(a.shieldResEm)}, ${sqlNum(a.shieldResExp)}, ${sqlNum(a.shieldResKin)}, ${sqlNum(a.shieldResTherm)}, ${sqlNum(a.armorHp)}, ${sqlNum(a.armorResEm)}, ${sqlNum(a.armorResExp)}, ${sqlNum(a.armorResKin)}, ${sqlNum(a.armorResTherm)}, ${sqlNum(a.structureHp)}, ${sqlNum(a.ehp)}, ${sqlNum(a.sigRadius)}, ${sqlNum(a.maxVelocity)}, ${sqlNum(a.orbitDistance)}, ${sqlNum(a.orbitVelocity)}, ${sqlNum(a.scram)}, ${sqlNum(a.web)}, ${sqlNum(a.neutAmount)}, ${sqlNum(a.neutDuration)}, ${sqlNum(a.neutCount)}, ${sqlNum(a.rrepAmount)}, ${sqlNum(a.rrepDuration)}, ${sqlNum(a.rrepCount)})`
  ).join(',\n  ');
  return `INSERT INTO sleeper_archetypes (type_id, name, blue_loot_isk, turret_dps, turret_alpha, missile_dps, missile_alpha, total_dps, total_alpha, shield_hp, shield_res_em, shield_res_exp, shield_res_kin, shield_res_therm, armor_hp, armor_res_em, armor_res_exp, armor_res_kin, armor_res_therm, structure_hp, ehp, sig_radius, max_velocity, orbit_distance, orbit_velocity, scram, web, neut_amount, neut_duration, neut_count, rrep_amount, rrep_duration, rrep_count) VALUES\n  ${values}\nON CONFLICT (type_id) DO NOTHING;`;
}

function buildSequenceResets(sites: SiteRow[], waves: WaveRow[], npcs: NpcRow[], resources: ResourceRow[], escalations: Escalation[]): string {
  // Reset serial sequences so future inserts pick up at MAX(id)+1.
  // Escalations table has serial id but we INSERT without explicit ids,
  // so its sequence advances naturally.
  const parts: string[] = [];
  if (sites.length) parts.push(`SELECT setval('sites_id_seq', (SELECT MAX(id) FROM sites));`);
  if (waves.length) parts.push(`SELECT setval('waves_id_seq', (SELECT MAX(id) FROM waves));`);
  if (npcs.length) parts.push(`SELECT setval('npcs_id_seq', (SELECT MAX(id) FROM npcs));`);
  if (resources.length) parts.push(`SELECT setval('site_resources_id_seq', (SELECT MAX(id) FROM site_resources));`);
  if (escalations.length) parts.push(`SELECT setval('escalations_id_seq', COALESCE((SELECT MAX(id) FROM escalations), 1));`);
  return parts.join('\n');
}

/* --------------------------------- main -------------------------------- */

async function main() {
  await mkdir(SEED_DIR, { recursive: true });

  console.log('Dumping DB…');
  const { sites, waves, npcs, resources } = await dumpDb();
  console.log(`  ${sites.length} sites · ${waves.length} waves · ${npcs.length} npcs · ${resources.length} resources`);

  console.log('Parsing Calculations → sleeper_archetypes…');
  const archetypes = await parseArchetypes();
  console.log(`  ${archetypes.length} archetypes`);

  console.log('Parsing Drifter + Avenger → escalations…');
  const escalations = await parseEscalations();
  console.log(`  ${escalations.length} escalations`);

  console.log('Transposing Sleeper Data + Missile Data → attribute snapshots…');
  const sleeperAttrs = await transposeAttributeTab(join(HERE, 'raw', '590981029-sleeper-data.csv'));
  const missileAttrs = await transposeAttributeTab(join(HERE, 'raw', '345568467-missile-data.csv'));
  console.log(`  ${Object.keys(sleeperAttrs).length} sleeper types · ${Object.keys(missileAttrs).length} missile types`);

  // JSON snapshots — committed to repo for reference / future native recompute.
  await writeFile(join(SEED_DIR, 'sites.json'), JSON.stringify(sites, null, 2) + '\n');
  await writeFile(join(SEED_DIR, 'waves.json'), JSON.stringify(waves, null, 2) + '\n');
  await writeFile(join(SEED_DIR, 'npcs.json'), JSON.stringify(npcs, null, 2) + '\n');
  await writeFile(join(SEED_DIR, 'resources.json'), JSON.stringify(resources, null, 2) + '\n');
  await writeFile(join(SEED_DIR, 'escalations.json'), JSON.stringify(escalations, null, 2) + '\n');
  await writeFile(join(SEED_DIR, 'sleeper-archetypes.json'), JSON.stringify(archetypes, null, 2) + '\n');
  await writeFile(join(SEED_DIR, 'sleeper-attributes.json'), JSON.stringify(sleeperAttrs, null, 2) + '\n');
  await writeFile(join(SEED_DIR, 'missile-attributes.json'), JSON.stringify(missileAttrs, null, 2) + '\n');

  // SQL migration. Drizzle's migrator splits on `--> statement-breakpoint`
  // to run each block as a separate statement; we put a breakpoint
  // between each table's INSERT.
  const SB = '--> statement-breakpoint';
  const sqlParts: string[] = [
    '-- Historical seed migration. Generated once by sheet-audit/extract-seed.ts',
    '-- from the local DB + the Sheet audit snapshot taken during Phase 2.6.',
    "-- Each block is ON CONFLICT-safe so this migration is idempotent against",
    "-- DBs that already hold a subset of the data (e.g. the dev's local).",
    '',
    buildSiteInsert(sites),
    SB,
    buildWaveInsert(waves),
    SB,
    buildNpcInsert(npcs),
    SB,
    buildResourceInsert(resources),
    SB,
    buildEscalationInsert(escalations),
    SB,
    buildArchetypeInsert(archetypes),
    SB,
    buildSequenceResets(sites, waves, npcs, resources, escalations),
    '',
  ].filter((s) => s !== undefined);

  await writeFile(MIGRATION_PATH, sqlParts.join('\n'));
  console.log(`\nWrote ${MIGRATION_PATH}`);

  // Register the manually-authored migration in Drizzle's journal so
  // `pnpm db:migrate` picks it up. `drizzle-kit generate` would normally
  // do this, but it only authors DDL — seed data has to be hand-rolled
  // and registered.
  const journalPath = join(REPO_ROOT, 'drizzle', 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    version: string; dialect: string; entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
  };
  const seedTag = '0006_historical_seed';
  const alreadyPresent = journal.entries.some((e) => e.tag === seedTag);
  if (!alreadyPresent) {
    journal.entries.push({
      idx: journal.entries.length,
      version: journal.entries[journal.entries.length - 1]?.version ?? '7',
      when: Date.now(),
      tag: seedTag,
      breakpoints: true,
    });
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n');
    console.log(`Registered ${seedTag} in drizzle/meta/_journal.json.`);
  } else {
    console.log(`${seedTag} already in journal; left untouched.`);
  }

  console.log('Seed JSON snapshots written to sheet-audit/seed-source/.');
}

main()
  .then(async () => {
    await sql.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await sql.end().catch(() => undefined);
    process.exit(1);
  });
