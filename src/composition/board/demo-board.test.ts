import { describe, expect, it } from 'vitest';
import { boardResponseSchema, type BoardSection } from './api-contract';
import { buildDemoBoard, DEMO_VARIANTS, demoVariant, FIXTURE_NOW } from './demo-board';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const full = buildDemoBoard(FIXTURE_NOW, 'full');
const byName = (name: string) => {
  const character = full.characters.find((c) => c.name === name);
  if (character === undefined) throw new Error(`no demo character ${name}`);
  return character;
};
function readyData<T>(section: BoardSection<T>): T {
  if (section.state !== 'ready') throw new Error(`section is ${section.state}`);
  return section.data;
}

describe('buildDemoBoard', () => {
  it.each(DEMO_VARIANTS)('variant %s satisfies the wire contract', (variant) => {
    const board = buildDemoBoard(FIXTURE_NOW, variant);
    expect(boardResponseSchema.parse(board)).toEqual(board);
  });

  it('never carries a scope string', () => {
    for (const variant of DEMO_VARIANTS) {
      expect(JSON.stringify(buildDemoBoard(FIXTURE_NOW, variant))).not.toContain('esi-');
    }
  });

  it('sizes each variant', () => {
    expect(full.characters.map((c) => c.name)).toEqual([
      'Aurel Vantesse',
      'Kessa Draymoor',
      'Torvin Hale',
      'Ilyana Mirek',
      'Bram Oskarsen',
    ]);
    expect(buildDemoBoard(FIXTURE_NOW, 'one').characters.map((c) => c.name)).toEqual(['Aurel Vantesse']);
    expect(buildDemoBoard(FIXTURE_NOW, 'reconnect').characters.map((c) => c.name)).toEqual(['Ilyana Mirek', 'Bram Oskarsen']);
    const empty = buildDemoBoard(FIXTURE_NOW, 'empty');
    expect(empty.characters).toEqual([]);
    expect(empty.skillCatalog.length).toBeGreaterThan(0);
  });

  it('uses synthetic character ids and NPC corporations', () => {
    expect(full.characters.map((c) => c.characterId)).toEqual([
      9_900_000_001, 9_900_000_002, 9_900_000_003, 9_900_000_004, 9_900_000_005,
    ]);
    expect(full.characters.map((c) => c.corporation?.id)).toEqual([1000035, 1000120, 1000049, 1000086, 1000057]);
  });

  it('covers the four queue states', () => {
    const aurel = readyData(byName('Aurel Vantesse').skills);
    expect(aurel.queue.map((entry) => entry.finish_date)).toEqual([
      new Date(FIXTURE_NOW + 20 * HOUR).toISOString(),
      new Date(FIXTURE_NOW + 3 * DAY).toISOString(),
    ]);

    const kessa = readyData(byName('Kessa Draymoor').skills);
    expect(kessa.queue).toHaveLength(1);
    expect(Date.parse(kessa.queue[0]!.finish_date!) - FIXTURE_NOW).toBe(9 * HOUR);

    const torvin = readyData(byName('Torvin Hale').skills);
    expect(torvin.queue).toEqual([
      { skill_id: 3419, queue_position: 0, finished_level: 4, level_start_sp: 24_000, level_end_sp: 135_765, training_start_sp: 61_000 },
    ]);

    expect(readyData(byName('Ilyana Mirek').skills).queue).toEqual([]);
  });

  it('gives the partially connected character reconnect for the new-scope sections only', () => {
    const ilyana = byName('Ilyana Mirek');
    expect(ilyana.gaps).toEqual(['wallet', 'clones', 'implants', 'structures']);
    expect({
      skills: ilyana.skills.state,
      profile: ilyana.profile.state,
      status: ilyana.status.state,
      attributes: ilyana.attributes.state,
      implants: ilyana.implants.state,
      clones: ilyana.clones.state,
      wallet: ilyana.wallet.state,
      journal: ilyana.journal.state,
      industry: ilyana.industry.state,
    }).toEqual({
      skills: 'ready',
      profile: 'ready',
      status: 'ready',
      attributes: 'ready',
      implants: 'reconnect',
      clones: 'reconnect',
      wallet: 'reconnect',
      journal: 'reconnect',
      industry: 'ready',
    });
  });

  it('gives the tokenless character every gap and no data at all', () => {
    const bram = byName('Bram Oskarsen');
    expect(bram.gaps).toEqual(['skills', 'location', 'wallet', 'clones', 'implants', 'structures', 'industry', 'orders', 'assets']);
    expect(bram.skills).toEqual({ state: 'reconnect' });
    expect(bram.wallet).toEqual({ state: 'reconnect' });
    expect(bram.status).toEqual({ state: 'reconnect' });
  });

  it('digests a 30-day journal that lands on the wallet balance', () => {
    const aurel = byName('Aurel Vantesse');
    const journal = readyData(aurel.journal);
    expect(journal.windowStart).toBe(new Date(FIXTURE_NOW - 30 * DAY).toISOString());
    expect(journal.recent).toHaveLength(20);
    expect(new Set(journal.recent.map((row) => row.refLabel)).size).toBeGreaterThanOrEqual(10);
    expect(journal.series.length).toBeGreaterThan(30);
    expect(journal.series.length).toBeLessThanOrEqual(48);
    expect(journal.series.at(-1)?.balance).toBe(readyData(aurel.wallet).balance);
    expect(journal.inflow).toBeGreaterThan(0);
    expect(journal.outflow).toBeGreaterThan(0);
  });

  it('keeps levels inside the catalog so the grouped view is consistent', () => {
    const catalogIds = new Set(full.skillCatalog.flatMap((group) => group.skills.map((s) => String(s.typeId))));
    for (const character of full.characters) {
      if (character.skills.state !== 'ready') continue;
      for (const typeId of Object.keys(character.skills.data.levels)) expect(catalogIds).toContain(typeId);
      expect(character.skills.data.known).toBe(Object.keys(character.skills.data.levels).length);
    }
    expect(full.skillCatalog).toHaveLength(10);
  });

  it('shows one docked, one undocked and one structure-named clone location', () => {
    const aurel = readyData(byName('Aurel Vantesse').status);
    expect(aurel.dock).toMatchObject({ kind: 'station', name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' });
    expect(aurel.system).toEqual({ id: 30000142, name: 'Jita', security: 0.945913, secClass: 'high' });

    const kessa = readyData(byName('Kessa Draymoor').status);
    expect(kessa.dock).toBeNull();
    expect(kessa.system.secClass).toBe('low');

    const clones = readyData(byName('Aurel Vantesse').clones);
    expect(clones.jumpClones.map((clone) => clone.location.name)).toEqual([
      'Amarr VIII (Oris) - Emperor Family Academy',
      'Sobaseki - Driftwood Anchorage',
    ]);
  });

  it("serves the connected pilots' recorded worth and marks the others reconnect", () => {
    const pilot = byName('Aurel Vantesse');
    const aurel = readyData(pilot.netWorth);
    expect(aurel.liquid).toBe(readyData(pilot.wallet).balance);
    expect(full.history.at(-1)!.pilots[String(pilot.characterId)]).toEqual({ netWorth: aurel.total, liquidIsk: aurel.liquid });
    // Hangar assets of 2.0–2.2B plus sell orders, escrow and implants (1,273,509,920.75).
    const owned = aurel.total - aurel.liquid;
    expect(owned).toBeGreaterThan(2_000_000_000 + 1_273_509_920.75);
    expect(owned).toBeLessThan(2_200_000_000 + 1_273_509_920.75);
    expect(byName('Kessa Draymoor').netWorth.state).toBe('ready');
    expect(byName('Torvin Hale').netWorth.state).toBe('ready');
    expect(byName('Ilyana Mirek').netWorth).toEqual({ state: 'reconnect' });
    expect(byName('Bram Oskarsen').netWorth).toEqual({ state: 'reconnect' });
  });

  it("carries about 90 days of history with skipped days, ending on today's live figure", () => {
    const days = full.history;
    expect(days.length).toBeGreaterThan(60);
    expect(days.length).toBeLessThan(90);
    expect(days.every((day, i) => i === 0 || day.day > days[i - 1]!.day)).toBe(true);
    expect(days.every((day) => day.included === 3 && day.total === 5)).toBe(true);
    const ready = full.characters.filter((c) => c.netWorth.state === 'ready');
    const last = days.at(-1)!;
    expect(last.day).toBe('2026-09-27');
    expect(last.netWorth).toBe(
      Math.round(ready.reduce((sum, c) => sum + (c.netWorth.state === 'ready' ? c.netWorth.data.total : 0), 0) * 100) / 100,
    );
    expect(Object.keys(last.pilots)).toEqual(ready.map((c) => String(c.characterId)));
    expect(buildDemoBoard(FIXTURE_NOW, 'empty').history).toEqual([]);
    expect(buildDemoBoard(FIXTURE_NOW, 'reconnect').history).toEqual([]);
  });

  it('is deterministic for a fixed clock', () => {
    expect(buildDemoBoard(FIXTURE_NOW, 'full')).toEqual(full);
  });
});

describe('demoVariant', () => {
  it.each([
    [undefined, null],
    ['', 'full'],
    ['full', 'full'],
    ['one', 'one'],
    [['reconnect', 'one'], 'reconnect'],
    ['empty', 'empty'],
    ['bogus', null],
  ])('%j -> %s', (param, expected) => {
    expect(demoVariant(param)).toBe(expected);
  });
});
