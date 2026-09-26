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

function humanize(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (first) => first.toUpperCase());
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function beaconModifiers(
  attributes: unknown,
  attributeById: ReadonlyMap<number, EffectAttributeRow>,
): WormholeEffectModifier[] {
  if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes)) return [];
  const modifiers: WormholeEffectModifier[] = [];
  for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
    const attribute = attributeById.get(Number(key));
    if (attribute === undefined || typeof value !== 'number' || !Number.isFinite(value)) continue;
    const toPercent = attribute.unitId === null ? undefined : PERCENT_BY_UNIT.get(attribute.unitId);
    if (toPercent === undefined) continue;
    const percent = roundPercent(toPercent(value));
    if (percent === 0) continue;
    modifiers.push({
      attributeId: attribute.id,
      label: attribute.displayName?.trim() || humanize(attribute.name),
      percent,
    });
  }
  return modifiers.sort((left, right) => left.label.localeCompare(right.label));
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
    if (typeof beacon.attributes !== 'object' || beacon.attributes === null) continue;
    for (const key of Object.keys(beacon.attributes)) {
      const id = Number(key);
      if (Number.isInteger(id)) ids.add(id);
    }
  }
  return [...ids].sort((left, right) => left - right);
}
