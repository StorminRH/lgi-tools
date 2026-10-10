import { getOrInsertComputed, sortedUniqueIds } from '@/lib/array';
import { capitalize, humanizeIdentifier } from '@/lib/format/text';
import { roundTo } from '@/lib/math';
import { asRecord } from './coerce';
import { WORMHOLE_EFFECTS, type WormholeEffect } from './wormhole-contract';

/**
 * Wormhole system effects from the SDE. Each effect ships one "Effect Beacon"
 * type per wormhole class (e.g. "Pulsar Effect Beacon Class 3"); the beacon's
 * dogma attributes are the modifiers it applies to ships in the system, and
 * `dgmAttributeTypes` gives each one CCP's display name and unit.
 */
export const EFFECT_BEACON_GROUP_ID = 920;

export interface WormholeEffectModifier {
  readonly attributeId: number;
  readonly label: string;
  /** Signed change in percent, e.g. 30 for +30% or -15 for -15%. */
  readonly percent: number;
}

export interface WormholeEffectEntry {
  readonly effect: WormholeEffect;
  readonly wormholeClass: number;
  readonly typeId: number;
  readonly modifiers: WormholeEffectModifier[];
}

export interface EffectBeaconRow {
  readonly id: number;
  readonly name: string;
  readonly attributes: unknown;
}

export interface EffectAttributeRow {
  readonly id: number;
  readonly name: string;
  readonly displayName: string | null;
  readonly unitId: number | null;
}

// Name fragments, lower-cased with everything but letters removed, that
// identify each effect's beacons. CCP spells some of these inconsistently
// ("Wolf Rayet", "Wolf-Rayet"), so matching ignores spacing and punctuation.
const EFFECT_NAME_KEYS: Readonly<Record<WormholeEffect, string>> = {
  pulsar: 'pulsar',
  'black-hole': 'blackhole',
  magnetar: 'magnetar',
  'red-giant': 'redgiant',
  'cataclysmic-variable': 'cataclysmic',
  'wolf-rayet': 'wolfrayet',
};

const BEACON_CLASS = /class\s*(\d+)/i;

/**
 * CCP dogma units that express a relative change, and how each converts to a
 * signed percent. Anything else on a beacon (radius, mass, and so on) is not
 * an effect on ships and is left out.
 */
const PERCENT_BY_UNIT: ReadonlyMap<number, (value: number) => number> = new Map([
  [104, (value: number) => (value - 1) * 100], // Multiplier: 1.3 → +30%
  [105, (value: number) => value], // Percentage
  [108, (value: number) => (1 - value) * 100], // Inverse Absolute Percent
  [109, (value: number) => (value - 1) * 100], // Modifier Percent
  [111, (value: number) => (1 - value) * 100], // Inversed Modifier Percent
  [124, (value: number) => value], // Modifier Relative Percent
  [127, (value: number) => value * 100], // Absolute Percent
]);

const PERCENT_BY_ATTRIBUTE: ReadonlyMap<string, (value: number) => number> = new Map([
  ['agilityMultiplier', (value: number) => (value - 1) * 100],
  ['energyTransferAmountBonus', (value: number) => (value - 1) * 100],
]);

/**
 * Player-facing names for CCP's beacon attribute display names, which are
 * written for dogma ("Damage multiplier multiplier", "Signature Penalty").
 * Anything not listed falls back to the display name with its trailing
 * "multiplier" / "bonus" / "modifier" / "penalty" words removed.
 */
const LABEL_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ['inertia modifier', 'Inertia'],
  ['energy transfer amount bonus', 'Remote capacitor transfer'],
  ['armor hitpoint bonus', 'Armor HP'],
  ['shield hitpoint bonus', 'Shield HP'],
  ['signature penalty', 'Signature radius'],
  ['capacitor recharge multiplier', 'Capacitor recharge time'],
  ['capacitor capacity multiplier', 'Capacitor capacity'],
  ['damage multiplier multiplier', 'Weapon damage'],
  ['small weapon damage multiplier', 'Small weapon damage'],
  ['explosion radius multiplier', 'Missile explosion radius'],
  ['explosion velocity multiplier', 'Missile explosion velocity'],
  ['missile velocity multiplier', 'Missile velocity'],
  ['maximum velocity multiplier', 'Max velocity'],
  ['targeting range bonus', 'Targeting range'],
  ['tracking speed multiplier', 'Turret tracking'],
  ['target painter effectiveness multiplier', 'Target painter strength'],
  ['stasis webifier strength multiplier', 'Stasis webifier strength'],
  ['energy warfare modifier', 'Neutralizer and nosferatu amount'],
  ['heat damage multiplier', 'Overheat damage'],
  ['overload bonus multiplier', 'Overheat bonus'],
  ['repair amount multiplier', 'Local armor repair'],
  ['shield repair multiplier', 'Local shield boost'],
  ['remote repair amount multiplier', 'Remote armor repair'],
  ['shield transfer amount multiplier', 'Remote shield boost'],
  ['smart bomb damage multiplier', 'Smart bomb damage'],
  ['smart bomb range multiplier', 'Smart bomb range'],
]);

const TRAILING_DOGMA_WORDS = /(\s+(multiplier|bonus|modifier|penalty))+$/i;

/**
 * Resistance attributes on beacons are damage resonance multipliers: a 15%
 * rise in resonance is a 15% drop in resistance, so the sign flips.
 */
const RESONANCE = /resonance|resistance/i;

const RESISTANCE_LAYER = /^(armor|shield) (em|explosive|kinetic|thermal) resistance$/i;

function lettersOnly(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

export function parseEffectBeaconName(
  name: string,
): { readonly effect: WormholeEffect; readonly wormholeClass: number } | null {
  const letters = lettersOnly(name);
  const effect = WORMHOLE_EFFECTS.find((candidate) => letters.includes(EFFECT_NAME_KEYS[candidate]));
  const classMatch = BEACON_CLASS.exec(name)?.[1];
  if (effect === undefined || classMatch === undefined) return null;
  return { effect, wormholeClass: Number(classMatch) };
}

export function effectModifierLabel(displayName: string | null, name: string): string {
  const raw = displayName?.trim() || humanizeIdentifier(name);
  const override = LABEL_OVERRIDES.get(raw.toLowerCase());
  if (override !== undefined) return override;
  return capitalize(raw.replace(TRAILING_DOGMA_WORDS, ''));
}

/**
 * Folds the four damage-type resistances of one layer into a single line
 * when they share a value, e.g. four "Armor ... resistance −15%" lines
 * become "Armor resistances −15%".
 */
function foldResistances(modifiers: WormholeEffectModifier[]): WormholeEffectModifier[] {
  const byLayer = new Map<string, WormholeEffectModifier[]>();
  for (const modifier of modifiers) {
    const layer = RESISTANCE_LAYER.exec(modifier.label)?.[1];
    if (layer === undefined) continue;
    getOrInsertComputed(byLayer, layer.toLowerCase(), () => []).push(modifier);
  }
  const folded = new Set<WormholeEffectModifier>();
  const merged: WormholeEffectModifier[] = [];
  for (const [layer, group] of byLayer) {
    const [first] = group;
    if (first === undefined || group.length !== 4) continue;
    if (!group.every((modifier) => modifier.percent === first.percent)) continue;
    for (const modifier of group) folded.add(modifier);
    merged.push({
      attributeId: first.attributeId,
      label: `${capitalize(layer)} resistances`,
      percent: first.percent,
    });
  }
  return [...modifiers.filter((modifier) => !folded.has(modifier)), ...merged];
}

function percentConverter(attribute: EffectAttributeRow): ((value: number) => number) | undefined {
  return PERCENT_BY_ATTRIBUTE.get(attribute.name)
    ?? (attribute.unitId === null ? undefined : PERCENT_BY_UNIT.get(attribute.unitId));
}

/** One attribute's signed percent change, or null when it has no percent form or rounds to 0. */
function attributeModifier(attribute: EffectAttributeRow, value: number): WormholeEffectModifier | null {
  const toPercent = percentConverter(attribute);
  if (toPercent === undefined) return null;
  const raw = roundTo(toPercent(value), 1);
  if (raw === 0) return null;
  const resonance = RESONANCE.test(attribute.name) || RESONANCE.test(attribute.displayName ?? '');
  return {
    attributeId: attribute.id,
    label: effectModifierLabel(attribute.displayName, attribute.name),
    percent: resonance ? -raw : raw,
  };
}

function beaconModifiers(
  attributes: unknown,
  attributeById: ReadonlyMap<number, EffectAttributeRow>,
): WormholeEffectModifier[] {
  const record = asRecord(attributes);
  if (record === null) return [];
  const modifiers: WormholeEffectModifier[] = [];
  for (const [key, value] of Object.entries(record)) {
    const attribute = attributeById.get(Number(key));
    if (attribute === undefined || typeof value !== 'number' || !Number.isFinite(value)) continue;
    const modifier = attributeModifier(attribute, value);
    if (modifier !== null) modifiers.push(modifier);
  }
  return foldResistances(modifiers).sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * One entry per (effect, wormhole class), built from the SDE's effect beacon
 * types. Beacons whose names do not identify an effect and class (incursion,
 * Pochven, and other beacons share the group) are skipped. When CCP ships two
 * beacons for the same pair, the lower type id wins.
 */
export function buildWormholeEffects(
  beacons: readonly EffectBeaconRow[],
  attributeRows: readonly EffectAttributeRow[],
): WormholeEffectEntry[] {
  const attributeById = new Map(attributeRows.map((row) => [row.id, row]));
  const byKey = new Map<string, WormholeEffectEntry>();
  for (const beacon of [...beacons].sort((left, right) => left.id - right.id)) {
    const parsed = parseEffectBeaconName(beacon.name);
    if (parsed === null) continue;
    const key = `${parsed.effect}:${parsed.wormholeClass}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      effect: parsed.effect,
      wormholeClass: parsed.wormholeClass,
      typeId: beacon.id,
      modifiers: beaconModifiers(beacon.attributes, attributeById),
    });
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.effect.localeCompare(right.effect) || left.wormholeClass - right.wormholeClass,
  );
}

/** The attribute ids a set of beacons carries, for loading their definitions. */
export function beaconAttributeIds(beacons: readonly EffectBeaconRow[]): number[] {
  const ids = new Set<number>();
  for (const beacon of beacons) {
    for (const key of Object.keys(asRecord(beacon.attributes) ?? {})) {
      const id = Number(key);
      if (Number.isInteger(id)) ids.add(id);
    }
  }
  return sortedUniqueIds(ids);
}
