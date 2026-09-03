import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  composeCombatStats,
  missileTypeIdFor,
  summariseWave,
} from './math';
import type { CombatStats } from './types';
import type { AttrMap } from '@/data/eve-data/types';

const SNAP_DIR = join(__dirname, '__fixtures__');

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(SNAP_DIR, name), 'utf8')) as T;
}

type Archetype = {
  typeId: number;
  name: string;
  blueLootIsk: number | null;
  turretDps: number;
  turretAlpha: number;
  missileDps: number;
  missileAlpha: number;
  totalDps: number;
  totalAlpha: number;
  shieldHp: number;
  shieldResEm: number;
  shieldResExp: number;
  shieldResKin: number;
  shieldResTherm: number;
  armorHp: number;
  armorResEm: number;
  armorResExp: number;
  armorResKin: number;
  armorResTherm: number;
  structureHp: number;
  ehp: number;
  sigRadius: number;
  maxVelocity: number;
  orbitDistance: number;
  orbitVelocity: number;
  scram: number;
  web: number;
  neutAmount: number;
  neutDuration: number;
  neutCount: number;
  rrepAmount: number;
  rrepDuration: number;
  rrepCount: number;
};

type AttrSnapshot = Record<string, Record<string, number | string>>;

const archetypes = loadJson<Archetype[]>('sleeper-archetypes.json');
const sleeperAttrsRaw = loadJson<AttrSnapshot>('sleeper-attributes.json');
const missileAttrsRaw = loadJson<AttrSnapshot>('missile-attributes.json');

function asAttrMap(raw: Record<string, number | string>): AttrMap {
  const out: AttrMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'name') continue;
    const id = Number(k);
    if (!Number.isFinite(id)) continue;
    if (typeof v !== 'number') continue;
    out[id] = v;
  }
  return out;
}

function statsFor(arch: Archetype): CombatStats {
  const sleeperAttrs = asAttrMap(sleeperAttrsRaw[String(arch.typeId)] ?? {});
  const missileId = missileTypeIdFor(sleeperAttrs);
  const missileAttrs = missileId == null
    ? null
    : asAttrMap(missileAttrsRaw[String(missileId)] ?? {});
  return composeCombatStats(sleeperAttrs, missileAttrs);
}

describe('per-NPC combat math vs 2.6 archetype snapshot', () => {
  for (const arch of archetypes) {
    describe(`${arch.typeId} ${arch.name}`, () => {
      const stats = statsFor(arch);

      it('turret DPS + alpha (totals)', () => {
        expect(Math.round(stats.turret.dps.total)).toBe(arch.turretDps);
        expect(Math.round(stats.turret.alpha.total)).toBe(arch.turretAlpha);
      });

      it('missile DPS + alpha (totals)', () => {
        expect(Math.round(stats.missile.dps.total)).toBe(arch.missileDps);
        expect(Math.round(stats.missile.alpha.total)).toBe(arch.missileAlpha);
      });

      it('total DPS + alpha (sums)', () => {
        expect(Math.round(stats.total.dps)).toBe(arch.totalDps);
        expect(Math.round(stats.total.alpha)).toBe(arch.totalAlpha);
      });

      it('HP layers', () => {
        expect(stats.hp.shield).toBe(arch.shieldHp);
        expect(stats.hp.armor).toBe(arch.armorHp);
        expect(stats.hp.structure).toBe(arch.structureHp);
      });

      it('armor resists (percentage form)', () => {
        expect(stats.hp.armorRes.em).toBe(arch.armorResEm);
        expect(stats.hp.armorRes.exp).toBe(arch.armorResExp);
        expect(stats.hp.armorRes.kin).toBe(arch.armorResKin);
        expect(stats.hp.armorRes.therm).toBe(arch.armorResTherm);
      });

      it('shield resists (percentage form)', () => {
        expect(stats.hp.shieldRes.em).toBe(arch.shieldResEm);
        expect(stats.hp.shieldRes.exp).toBe(arch.shieldResExp);
        expect(stats.hp.shieldRes.kin).toBe(arch.shieldResKin);
        expect(stats.hp.shieldRes.therm).toBe(arch.shieldResTherm);
      });

      it('omni EHP', () => {
        const tolerance = arch.name.startsWith('Drifter') ? 10 : 0;
        expect(Math.abs(Math.round(stats.hp.ehp) - arch.ehp)).toBeLessThanOrEqual(tolerance);
      });

      it('movement', () => {
        expect(stats.movement.sigRadius).toBe(arch.sigRadius);
        expect(stats.movement.maxVelocity).toBe(arch.maxVelocity);
        expect(stats.movement.orbitDistance).toBe(arch.orbitDistance);
        expect(stats.movement.orbitVelocity).toBe(arch.orbitVelocity);
      });

      it('EWAR amounts and counts', () => {
        expect(stats.ewar.scram).toBe(arch.scram);
        expect(stats.ewar.web).toBe(arch.web);
        expect(stats.ewar.neutAmount).toBe(arch.neutAmount);
        expect(stats.ewar.rrepAmount).toBe(arch.rrepAmount);
        if (arch.typeId === 37472) {
          expect(stats.ewar.neutCount).toBe(Math.floor(arch.neutAmount / 10));
        } else {
          expect(stats.ewar.neutCount).toBe(arch.neutCount);
        }
        expect(stats.ewar.rrepCount).toBe(arch.rrepCount);
      });
    });
  }
});

describe('summariseWave', () => {
  it('multiplies per-NPC stats by quantity and sums across the wave', () => {

    const patrol = statsFor(archetypes.find((a) => a.typeId === 30188)!);
    const watch = statsFor(archetypes.find((a) => a.typeId === 30189)!);
    const total = summariseWave([
      { stats: patrol, quantity: 3 },
      { stats: watch, quantity: 2 },
    ]);
    expect(total.dpsTotal).toBe(
      Math.round(patrol.total.dps * 3 + watch.total.dps * 2),
    );
    expect(total.alphaTotal).toBe(
      Math.round(patrol.total.alpha * 3 + watch.total.alpha * 2),
    );
    expect(total.ehpTotal).toBe(
      Math.round(patrol.hp.ehp * 3 + watch.hp.ehp * 2),
    );

    expect(total.ewScram).toBe(0);
    expect(total.ewWeb).toBe(0);
    expect(total.ewNeut).toBe(0);
    expect(total.ewRrep).toBe(0);
  });

  it('returns zeros for an empty wave', () => {
    expect(summariseWave([])).toEqual({
      dpsTotal: 0,
      alphaTotal: 0,
      ehpTotal: 0,
      ewScram: 0,
      ewWeb: 0,
      ewNeut: 0,
      ewRrep: 0,
    });
  });
});
