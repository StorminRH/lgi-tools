import { describe, expect, it } from 'vitest';
import { boardResponseSchema } from '@/composition/board/api-contract';
import { buildDemoBoard, FIXTURE_NOW } from '@/composition/board/demo-board';
import {
  balanceChart,
  characterAge,
  characterSecurityClass,
  coverageNote,
  boardTransitionType,
  boardViewFrom,
  combinedFlow,
  industryTotals,
  netWorthSeries,
  railOrder,
  walletShares,
  boardViewHref,
  characterParam,
  fittedDomain,
  flowWindowLabel,
  effectiveSkills,
  groupSkills,
  placeName,
  queueTimeline,
  boardIsCold,
  queueHealth,
  queueWindow,
  remainingQueue,
  recentJournal,
  reconnectSentence,
  rosterTotals,
  skillNames,
  tileModel,
} from './board-view-model';

const NOW = FIXTURE_NOW;
const board = boardResponseSchema.parse(buildDemoBoard(NOW, 'full'));
const [aurel, kessa, torvin, ilyana, bram] = board.characters;
const names = skillNames(board.skillCatalog);

describe('rosterTotals', () => {
  it('sums only the characters that have the data and says how many', () => {
    const totals = rosterTotals(board.characters, NOW);
    expect(totals.pilots).toBe(5);
    expect(totals.training).toBe(2);
    expect(totals.isk).toEqual({ value: expect.closeTo(4_112_776_212.67, 1), covered: 3, total: 5 });
    expect(totals.sp).toEqual({ value: 73_748_880, covered: 4, total: 5 });
    expect(coverageNote(totals.isk!)).toBe(' (3 of 5)');
  });

  it('leaves a sum out entirely when no character has it', () => {
    const reconnect = buildDemoBoard(NOW, 'reconnect').characters;
    expect(rosterTotals(reconnect, NOW).isk).toBeNull();
    expect(coverageNote({ value: 1, covered: 2, total: 2 })).toBe('');
  });
});

describe('queueHealth', () => {
  it('reads ok, amber under a day, and red when paused or empty', () => {
    expect(queueHealth(aurel!.skills, NOW)).toEqual({ tone: 'ok', label: 'Queue ends in 3d' });
    expect(queueHealth(kessa!.skills, NOW)).toEqual({ tone: 'warn', label: 'Queue ends in 9h' });
    expect(queueHealth(torvin!.skills, NOW)).toEqual({ tone: 'bad', label: 'Queue paused' });
    expect(queueHealth(ilyana!.skills, NOW)).toEqual({ tone: 'bad', label: 'Skill queue is empty' });
    expect(queueHealth(bram!.skills, NOW).tone).toBe('quiet');
    expect(queueHealth({ state: 'pending' }, NOW)).toEqual({ tone: 'quiet', label: 'Syncing from EVE…' });
  });
});

describe('tileModel', () => {
  it('carries the training line, ISK, SP and system for a ready character', () => {
    const tile = tileModel(aurel!, names, NOW);
    expect(tile).toMatchObject({
      name: 'Aurel Vantesse',
      online: true,
      isk: 3_204_115_882.15,
      totalSp: 41_512_880,
      skillName: 'Caldari Cruiser',
      remainingLabel: '20h',
      needsReconnect: false,
    });
    expect(tile.training?.kind).toBe('training');
    expect(tile.system?.name).toBe('Jita');
  });

  it('never invents a zero for a section it cannot read', () => {
    const tile = tileModel(bram!, names, NOW);
    expect(tile.isk).toBeNull();
    expect(tile.online).toBeNull();
    expect(tile.totalSp).toBeNull();
    expect(tile.training).toBeNull();
    expect(tile.needsReconnect).toBe(true);
    expect(tileModel(ilyana!, names, NOW).isk).toBeNull();
  });
});

describe('reconnectSentence', () => {
  it('names what a reconnect would add, or nothing for a healthy link', () => {
    expect(reconnectSentence(aurel!)).toBeNull();
    expect(reconnectSentence(ilyana!)).toBe(
      'Reconnect Ilyana Mirek to add wallet, clones, implants and structure names.',
    );
    expect(reconnectSentence(bram!)).toBe('Reconnect Bram Oskarsen to start syncing it again.');
    expect(reconnectSentence({ ...aurel!, gaps: ['industry'] })).toBe(
      'Reconnect Aurel Vantesse to add industry jobs.',
    );
  });
});

describe('board view state', () => {
  const chars = board.characters;

  it('opens a character named in the URL and the overview for anything else', () => {
    expect(boardViewFrom(String(kessa!.characterId), chars)).toEqual({
      view: 'character',
      characterId: kessa!.characterId,
    });
    expect(boardViewFrom(null, chars)).toEqual({ view: 'overview' });
    expect(boardViewFrom('42', chars)).toEqual({ view: 'overview' });
    expect(boardViewFrom('9900000002abc', chars)).toEqual({ view: 'overview' });
    expect(boardViewFrom('', chars)).toEqual({ view: 'overview' });
    expect(characterParam(new URLSearchParams('?character=7'))).toBe('7');
  });

  it('always opens a lone pilot on its own sheet', () => {
    const one = buildDemoBoard(NOW, 'one').characters;
    expect(boardViewFrom(null, one)).toEqual({ view: 'character', characterId: 9_900_000_001 });
    expect(boardViewFrom('42', one)).toEqual({ view: 'character', characterId: 9_900_000_001 });
  });

  it('opens toward a pilot and closes toward the overview', () => {
    expect(boardTransitionType({ view: 'character', characterId: 1 })).toBe('board-open');
    expect(boardTransitionType({ view: 'overview' })).toBe('board-close');
  });

  it('puts the main pilot first and keeps link order for the rest', () => {
    const ids = (list: readonly { characterId: number }[]) => list.map((c) => c.characterId % 10);
    expect(ids(railOrder(chars, torvin!.characterId))).toEqual([3, 1, 2, 4, 5]);
    expect(ids(railOrder(chars, null))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(railOrder(chars, 42))).toEqual([1, 2, 3, 4, 5]);
    expect(railOrder([], 1)).toEqual([]);
  });

  it('writes the view into the URL and keeps the other params', () => {
    expect(boardViewHref('/', '', { view: 'character', characterId: 7 })).toBe('/?character=7');
    expect(boardViewHref('/', '?demo&character=7', { view: 'overview' })).toBe('/?demo');
    expect(boardViewHref('/', '?demo=one', { view: 'character', characterId: 8 })).toBe(
      '/?demo=one&character=8',
    );
    expect(boardViewHref('/', '?character=7', { view: 'overview' })).toBe('/');
  });
});

describe('groupSkills', () => {
  it('groups trained skills by catalog group with trained/total counts', () => {
    const skills = aurel!.skills.state === 'ready' ? aurel!.skills.data : null;
    const groups = groupSkills({ levels: skills!.levels, reported: {} }, board.skillCatalog);
    const names = groups.map((group) => group.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const gunnery = groups.find((group) => group.name === 'Gunnery');
    expect(gunnery).toMatchObject({ trained: 3, total: 4 });
    expect(gunnery?.skills.map((skill) => skill.level)).toEqual([5, 4, 5]);
    expect(groups.every((group) => group.trained > 0)).toBe(true);
  });
});

describe('wallet models', () => {
  it('labels the flow window honestly', () => {
    expect(flowWindowLabel('2026-08-28T12:00:00.000Z', NOW)).toBe('last 30 days');
    expect(flowWindowLabel('2026-09-20T00:00:00.000Z', NOW)).toBe('since 20 Sept 2026');
  });

  it('charts the balance series and keeps the newest 20 journal rows', () => {
    const journal = aurel!.journal.state === 'ready' ? aurel!.journal.data : null;
    const chart = balanceChart(journal!.series);
    expect(chart.points).toHaveLength(journal!.series.length);
    expect(chart.labels[0]).toBe('29 Aug 2026');
    const balances = journal!.series.map((point) => point.balance);
    expect(chart.domain).toEqual(fittedDomain(balances));
    const recent = recentJournal(journal!.recent);
    expect(recent.length).toBeLessThanOrEqual(20);
    expect(Date.parse(recent[0]!.date)).toBeGreaterThanOrEqual(Date.parse(recent.at(-1)!.date));
  });
});

describe('sheet helpers', () => {
  it('formats age and security status colour', () => {
    expect(characterAge('2014-03-11T09:42:00Z', NOW)).toBe('12y 6m');
    expect(characterAge('2026-09-01T00:00:00Z', NOW)).toBe('0m');
    expect(characterAge('2025-09-27T00:00:00Z', NOW)).toBe('1y');
    expect(characterAge('nope', NOW)).toBeNull();
    expect(characterSecurityClass(2.31)).toBe('text-sec-08');
    expect(characterSecurityClass(-1.8)).toBe('text-sec-04');
    expect(characterSecurityClass(-7)).toBe('text-sec-02');
    expect(characterSecurityClass(null)).toBe('text-muted');
  });
});

describe('places and timeline', () => {
  it('names an inaccessible structure plainly', () => {
    expect(placeName({ kind: 'structure', id: 1, name: null, system: null })).toBe('Player structure');
    expect(placeName({ kind: 'station', id: 60003760, name: null, system: null })).toBe('Station 60003760');
    expect(placeName({ kind: 'station', id: 1, name: 'Jita 4-4', system: null })).toBe('Jita 4-4');
  });

  it('splits the time left across unfinished entries', () => {
    const skills = aurel!.skills.state === 'ready' ? aurel!.skills.data : null;
    const timeline = queueTimeline(skills!.queue, NOW);
    expect(timeline?.segments.map((segment) => segment.training)).toEqual([true, false]);
    expect(timeline?.endsAt).toBe(Date.parse('2026-09-30T12:00:00.000Z'));
    expect(queueTimeline([], NOW)).toBeNull();
    expect(queueTimeline([{ skill_id: 1, queue_position: 0, finished_level: 1 }], NOW)).toBeNull();
  });

  it('flags a board with a syncing section as cold', () => {
    expect(boardIsCold(board)).toBe(false);
    expect(boardIsCold({ characters: [{ ...aurel!, wallet: { state: 'pending' } }] })).toBe(true);
  });
});

describe('fittedDomain', () => {
  it('fits a large balance with a small swing instead of starting at zero', () => {
    expect(fittedDomain([3_200_000_000, 3_500_000_000, 3_400_000_000])).toEqual([3_170_000_000, 3_530_000_000]);
  });

  it('pads a flat series by a share of its value', () => {
    expect(fittedDomain([2_000, 2_000])).toEqual([1_800, 2_200]);
  });

  it('pads a flat zero series by one unit share', () => {
    expect(fittedDomain([0, 0])).toEqual([-0.1, 0.1]);
  });
});

describe('overview model', () => {
  const chars = board.characters;

  it('sums wallets, flow and industry honestly', () => {
    expect(walletShares(chars).map((share) => share.label)).toEqual(['Aurel Vantesse', 'Kessa Draymoor', 'Torvin Hale']);
    expect(combinedFlow(chars, NOW)).toEqual({
      inflow: 977_835_008,
      outflow: 846_237_440,
      label: 'last 30 days',
      covered: 3,
      total: 5,
    });
    expect(industryTotals(chars)).toEqual({
      active: 4,
      ready: 2,
      used: 6,
      max: 20,
      readyPilots: ['Aurel Vantesse', 'Torvin Hale'],
      covered: 4,
      total: 5,
    });
    expect(combinedFlow([bram!], NOW)).toBeNull();
    expect(industryTotals([bram!])).toBeNull();
  });

  it('labels a combined flow whose windows differ', () => {
    const recent = aurel!.journal.state === 'ready' ? aurel!.journal.data : null;
    const shorter = { ...kessa!, journal: { state: 'ready' as const, refreshedAt: NOW, data: { ...recent!, windowStart: '2026-09-20T00:00:00.000Z' } } };
    expect(combinedFlow([aurel!, shorter], NOW)?.label).toBe('windows differ; shortest since 20 Sept 2026');
  });
});

describe('netWorthSeries', () => {
  const day = (iso: string) => Date.parse(iso);
  const journalOf = (windowStart: string, series: { t: number; balance: number }[]) => ({
    state: 'ready' as const,
    refreshedAt: NOW,
    data: { windowStart, inflow: 0, outflow: 0, series, recent: [] },
  });
  const walletOf = (balance: number) => ({ state: 'ready' as const, refreshedAt: NOW, data: { balance } });
  const pilotA = {
    ...aurel!,
    journal: journalOf('2026-09-20T00:00:00.000Z', [
      { t: day('2026-09-21T00:00:00Z'), balance: 100 },
      { t: day('2026-09-25T06:00:00Z'), balance: 150 },
    ]),
    wallet: walletOf(170),
  };
  const pilotB = {
    ...kessa!,
    journal: journalOf('2026-09-24T00:00:00.000Z', [
      { t: day('2026-09-24T18:00:00Z'), balance: 10 },
      { t: day('2026-09-26T01:00:00Z'), balance: 20 },
    ]),
    wallet: walletOf(25),
  };

  it('sums daily balances over the window every pilot covers, ending on the current balance', () => {
    expect(netWorthSeries([pilotA, pilotB], NOW)).toEqual({
      points: [
        { t: day('2026-09-24T00:00:00Z'), balance: 110 },
        { t: day('2026-09-25T00:00:00Z'), balance: 160 },
        { t: day('2026-09-26T00:00:00Z'), balance: 170 },
        { t: day('2026-09-27T00:00:00Z'), balance: 195 },
      ],
      from: day('2026-09-24T00:00:00Z'),
      included: 2,
      of: 2,
    });
  });

  it('leaves out a pilot without wallet access and says so', () => {
    const noWallet = { ...torvin!, journal: pilotB.journal, wallet: { state: 'reconnect' as const } };
    const series = netWorthSeries([pilotA, pilotB, noWallet], NOW);
    expect([series.included, series.of]).toEqual([2, 3]);
    expect(series.points.at(-1)?.balance).toBe(195);
  });

  it('equals a lone pilot’s own curve', () => {
    expect(netWorthSeries([pilotB], NOW).points.map((point) => point.balance)).toEqual([10, 10, 20, 25]);
  });

  it('is empty with no included pilot or under two days of window', () => {
    expect(netWorthSeries([bram!], NOW)).toEqual({ points: [], from: null, included: 0, of: 1 });
    const today = { ...pilotB, journal: journalOf('2026-09-27T03:00:00.000Z', []) };
    expect(netWorthSeries([today], NOW).points).toEqual([]);
  });

  it('covers the demo board from its journal window to today', () => {
    const series = netWorthSeries(board.characters, NOW);
    expect([series.from, series.included, series.of, series.points.length]).toEqual([
      day('2026-08-28T12:00:00.000Z'),
      3,
      5,
      31,
    ]);
    expect(series.points.at(-1)?.balance).toBeCloseTo(4_112_776_212.67, 1);
  });
});

describe('queueWindow', () => {
  const HOUR = 3_600_000;
  const entry = (position: number, startH: number | null, endH: number | null) => ({
    skill_id: 3300 + position,
    queue_position: position,
    finished_level: 1,
    ...(startH === null ? {} : { start_date: new Date(NOW + startH * HOUR).toISOString() }),
    ...(endH === null ? {} : { finish_date: new Date(NOW + endH * HOUR).toISOString() }),
  });
  const ready = (queue: ReturnType<typeof entry>[]) => ({
    state: 'ready' as const,
    refreshedAt: NOW,
    data: { totalSp: 1, unallocatedSp: null, queue, levels: {}, known: 0, atV: 0 },
  });

  it('drops finished entries and shows the next five of what remains', () => {
    const queue = Array.from({ length: 42 }, (_, i) => entry(i, i - 3.5, i - 2.5));
    const window = queueWindow(queue, NOW);
    expect(window.visible.map((row) => row.entry.queue_position)).toEqual([3, 4, 5, 6, 7]);
    expect(window.visible.map((row) => row.number)).toEqual([1, 2, 3, 4, 5]);
    expect(window.total).toBe(39);
    const all = remainingQueue(queue, NOW);
    expect([all[0]?.number, all.at(-1)?.number, all.length]).toEqual([1, 39, 39]);
  });

  it('treats a queue whose entries have all finished as empty', () => {
    const queue = [entry(0, -9, -6), entry(1, -6, -3), entry(2, -3, -1)];
    expect(queueWindow(queue, NOW)).toEqual({ visible: [], total: 0 });
    expect(queueHealth(ready(queue), NOW)).toEqual({ tone: 'bad', label: 'Skill queue is empty' });
    expect(queueTimeline(queue, NOW)).toBeNull();
  });

  it('is empty for an empty queue', () => {
    expect(queueWindow([], NOW)).toEqual({ visible: [], total: 0 });
  });

  it('keeps a paused queue, which has no dates, in the window', () => {
    const queue = [entry(0, null, null), entry(1, null, null)];
    expect(queueWindow(queue, NOW)).toEqual({
      visible: [
        { number: 1, entry: queue[0] },
        { number: 2, entry: queue[1] },
      ],
      total: 2,
    });
    expect(queueHealth(ready(queue), NOW)).toEqual({ tone: 'bad', label: 'Queue paused' });
  });

  it('never counts a finished entry as training or time left', () => {
    expect(queueHealth(ready([entry(0, -9, -1), entry(1, -1, 5)]), NOW)).toEqual({
      tone: 'warn',
      label: 'Queue ends in 5h',
    });
    expect(queueHealth(ready([entry(0, -9, -1), entry(1, null, null)]), NOW)).toEqual({
      tone: 'bad',
      label: 'Queue paused',
    });
  });
});

describe('effectiveSkills', () => {
  const HOUR = 3_600_000;
  const done = (skillId: number, level: number, endH = -1) => ({
    skill_id: skillId,
    queue_position: 0,
    finished_level: level,
    start_date: new Date(NOW + (endH - 2) * HOUR).toISOString(),
    finish_date: new Date(NOW + endH * HOUR).toISOString(),
  });
  const base = { levels: { '3300': 4, '3301': 2 }, known: 2, atV: 0 };

  it('counts finished queue entries as trained where ESI still lags', () => {
    const skills = effectiveSkills(
      { ...base, queue: [done(3300, 5), done(3302, 1), done(3302, 2), done(3301, 3, 4)] },
      NOW,
    );
    expect(skills).toEqual({
      levels: { '3300': 5, '3301': 2, '3302': 2 },
      reported: { '3300': 4, '3302': 0 },
      known: 3,
      atV: 1,
    });
  });

  it('leaves levels alone when ESI already has them', () => {
    expect(effectiveSkills({ ...base, queue: [done(3300, 3)] }, NOW)).toEqual({
      levels: base.levels,
      reported: {},
      known: 2,
      atV: 0,
    });
  });

  it('marks the raised skill in its group', () => {
    const catalog = [{ groupId: 1, name: 'Gunnery', skills: [{ typeId: 3300, name: 'Gunnery', rank: 1 }] }];
    const [group] = groupSkills(effectiveSkills({ ...base, queue: [done(3300, 5)] }, NOW), catalog);
    expect(group).toMatchObject({ trained: 1, atV: 1, skills: [{ level: 5, reported: 4 }] });
  });
});
