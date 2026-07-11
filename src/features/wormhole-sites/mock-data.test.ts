import { describe, expect, it } from 'vitest';
import { npc, resource, wave } from './mock-data';

describe('npc', () => {
  it('maps a fully-flagged sleeper to its normalized shape', () => {
    const n = npc(1, {
      quantity: 3,
      name: 'Sleeper Sentinel',
      cls: 'C',
      ehp: 50_000,
      dps: 200,
      web: true,
      scram: true,
      neut: true,
      rr: true,
      trigger: true,
    });
    expect(typeof n.id).toBe('number'); // shared module counter — never assert its value
    expect(n.orderInWave).toBe(1);
    expect(n.triggerLabel).toBe('Trigger');
    expect(n.quantity).toBe(3);
    expect(n.sleeperName).toBe('Sleeper Sentinel');
    expect(n.sleeperClassCode).toBe('C');
    expect(n.scram).toBe(1);
    expect(n.web).toBe(1);
    expect(n.neut).toBe(1);
    expect(n.rrep).toBe(1);
    expect(n.dps).toBe(200);
    expect(n.ehp).toBe(50_000);
  });

  it('nulls every optional flag and defaults the class when they are absent', () => {
    const n = npc(2, { quantity: 1, name: 'Sleeper Drone' });
    expect(n.triggerLabel).toBeNull();
    expect(n.sleeperClassCode).toBe('F'); // default
    expect(n.scram).toBeNull();
    expect(n.web).toBeNull();
    expect(n.neut).toBeNull();
    expect(n.rrep).toBeNull();
    expect(n.dps).toBeNull();
    expect(n.ehp).toBeNull();
  });
});

describe('wave', () => {
  it('sums EW across npcs and reports a positive total', () => {
    const flagged = npc(1, { quantity: 1, name: 'A', web: true, scram: true, neut: true, rr: true });
    const bare = npc(2, { quantity: 1, name: 'B' });
    const w = wave(1, 'Initial', 500, [flagged, bare]);
    expect(w.waveNumber).toBe(1);
    expect(w.waveLabel).toBe('Initial');
    expect(w.dpsTotal).toBe(500);
    expect(w.ewWeb).toBe(1);
    expect(w.ewScram).toBe(1);
    expect(w.ewNeut).toBe(1);
    expect(w.ewRrep).toBe(1);
    expect(w.npcs).toHaveLength(2);
    expect(w.alphaTotal).toBe(0);
    expect(w.ehpTotal).toBe(0);
  });

  it('nulls each EW total when the wave has none', () => {
    const w = wave(2, 'Empty', 0, [npc(1, { quantity: 1, name: 'C' })]);
    expect(w.ewWeb).toBeNull();
    expect(w.ewScram).toBeNull();
    expect(w.ewNeut).toBeNull();
    expect(w.ewRrep).toBeNull();
  });
});

describe('resource', () => {
  it('carries provided extras through and mirrors totalIsk into effectiveIsk', () => {
    const r = resource(1, 'ore', 'Veldspar', 1000, { units: 5, volumeM3: 50, iskPerM3: 20 });
    expect(r.orderInSite).toBe(1);
    expect(r.resourceKind).toBe('ore');
    expect(r.resourceName).toBe('Veldspar');
    expect(r.units).toBe(5);
    expect(r.volumeM3).toBe(50);
    expect(r.iskPerM3).toBe(20);
    expect(r.totalIsk).toBe(1000);
    expect(r.effectiveIsk).toBe(1000);
    expect(r.typeId).toBeNull();
    expect(r.liveIsk).toBeNull();
    expect(r.liveEligible).toBe(false);
  });

  it('nulls the optional extras when omitted', () => {
    const r = resource(2, 'gas', 'Fullerite', 2000);
    expect(r.units).toBeNull();
    expect(r.volumeM3).toBeNull();
    expect(r.iskPerM3).toBeNull();
    expect(r.effectiveIsk).toBe(2000);
  });
});
