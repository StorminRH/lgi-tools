import { describe, expect, it, test } from 'vitest';
import { type BoardHistoryDay, boardResponseSchema } from '@/composition/board/api-contract';
import { buildDemoBoard, FIXTURE_NOW } from '@/composition/board/demo-board';
import {
  balanceChart,
  characterAge,
  characterSecurityClass,
  boardTransitionType,
  boardViewFrom,
  combinedFlow,
  industryTotals,
  netWorthSeries,
  railOrder,
  accountWorthSeries,
  netWorthTotals,
  pilotWorthSeries,
  worthShares,
  worthChartMode,
  splitDomains,
  boardViewHref,
  characterParam,
  flowWindowLabel,
  focusedView,
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
  skillNames,
  tileModel,
} from './board-view-model';

const NOW = FIXTURE_NOW;
const board = boardResponseSchema.parse(buildDemoBoard(NOW, 'full'));
const [aurel, kessa, torvin, ilyana, bram] = board.characters;
const names = skillNames(board.skillCatalog);

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
  it('carries the training line and system for a ready character', () => {
    const tile = tileModel(aurel!, names, NOW);
    expect(tile).toMatchObject({
      name: 'Aurel Vantesse',
      online: true,
      skillName: 'Caldari Cruiser',
      remainingLabel: '20h',
      needsReconnect: false,
    });
    expect(tile.training?.kind).toBe('training');
    expect(tile.system?.name).toBe('Jita');
  });

  it('never invents a zero for a section it cannot read', () => {
    const tile = tileModel(bram!, names, NOW);
    expect(tile.online).toBeNull();
    expect(tile.training).toBeNull();
    expect(tile.needsReconnect).toBe(true);
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

  it('focuses a character only for a whole-number id the caller has', () => {
    const hasSeven = (id: number) => id === 7;
    expect(focusedView('7', hasSeven)).toEqual({ view: 'character', characterId: 7 });
    expect(focusedView('8', hasSeven)).toEqual({ view: 'overview' });
    for (const param of [null, '', '-7', '7.5', '7abc', ' 7']) {
      expect(focusedView(param, () => true)).toEqual({ view: 'overview' });
    }
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
    const [low, high] = chart.domain;
    expect(low).toBeLessThan(Math.min(...balances));
    expect(high).toBeGreaterThan(Math.max(...balances));
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
    expect(boardIsCold({ characters: [{ ...aurel!, netWorth: { state: 'pending' } }] })).toBe(true);
    expect(boardIsCold({ characters: [{ ...aurel!, netWorth: { state: 'reconnect' } }] })).toBe(false);
  });
});

test('the balance chart pads a swinging series by a tenth of its range, a flat one by a tenth of its value, and an all-zero one by 1 ISK', () => {
  const series = (balances: number[]) => balances.map((balance, t) => ({ t, balance }));
  expect(balanceChart(series([3_200_000_000, 3_500_000_000, 3_400_000_000])).domain).toEqual([3_170_000_000, 3_530_000_000]);
  expect(balanceChart(series([2_000, 2_000])).domain).toEqual([1_800, 2_200]);
  expect(balanceChart(series([0, 0])).domain).toEqual([-1, 1]);
});

describe('overview model', () => {
  const chars = board.characters;

  it('sums wallets, flow and industry honestly', () => {
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

  it('keeps an inactive pilot’s balance across an empty synced journal window', () => {
    const inactive = { ...pilotB, journal: journalOf('2026-09-24T00:00:00.000Z', []) };
    expect(netWorthSeries([inactive], NOW).points.map((point) => point.balance)).toEqual([25, 25, 25, 25]);
    expect(netWorthSeries([pilotA, inactive], NOW).points.map((point) => point.balance)).toEqual([125, 175, 175, 195]);
  });

  it('omits unknown history when journal entries have no balances', () => {
    const journal = journalOf('2026-09-24T00:00:00.000Z', []);
    const unknown = {
      ...pilotB,
      journal: {
        ...journal,
        data: {
          ...journal.data,
          recent: [{ id: 1, date: '2026-09-24T12:00:00Z', refLabel: 'Gift', amount: 25, description: '' }],
        },
      },
    };
    expect(netWorthSeries([unknown], NOW)).toEqual({ points: [], from: null, included: 0, of: 1 });
    const mixed = netWorthSeries([pilotA, unknown], NOW);
    expect([mixed.included, mixed.of, mixed.points.at(-1)?.balance]).toEqual([1, 2, 170]);
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

  it('treats a finished queue and an empty queue as nothing left to show', () => {
    const queue = [entry(0, -9, -6), entry(1, -6, -3), entry(2, -3, -1)];
    expect(queueWindow(queue, NOW)).toEqual({ visible: [], total: 0 });
    expect(queueWindow([], NOW)).toEqual({ visible: [], total: 0 });
    expect(queueHealth(ready(queue), NOW)).toEqual({ tone: 'bad', label: 'Skill queue is empty' });
    expect(queueTimeline(queue, NOW)).toBeNull();
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

  it('keeps an entry whose finish does not parse, reading it as paused', () => {
    const garbled = { ...entry(0, -1, null), finish_date: 'garbage' };
    expect(remainingQueue([garbled], NOW)).toEqual([{ number: 1, entry: garbled }]);
    expect(queueHealth(ready([garbled]), NOW)).toEqual({ tone: 'bad', label: 'Queue paused' });
    expect(queueTimeline([garbled], NOW)).toBeNull();
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

  it('counts finished queue entries as trained where ESI still lags, and leaves levels ESI already has', () => {
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
    expect(effectiveSkills({ ...base, queue: [done(3300, 3)] }, NOW)).toEqual({
      levels: base.levels,
      reported: {},
      known: 2,
      atV: 0,
    });
    const catalog = [{ groupId: 1, name: 'Gunnery', skills: [{ typeId: 3300, name: 'Gunnery', rank: 1 }] }];
    const [group] = groupSkills(effectiveSkills({ ...base, queue: [done(3300, 5)] }, NOW), catalog);
    expect(group).toMatchObject({ trained: 1, atV: 1, skills: [{ level: 5, reported: 4 }] });
  });

  it('applies a passed finish without a start date, but never a finish that does not parse', () => {
    const { start_date: _start, ...undated } = done(3300, 5);
    const garbled = { ...done(3302, 1), finish_date: 'garbage' };
    expect(effectiveSkills({ ...base, queue: [undated, garbled] }, NOW)).toEqual({
      levels: { '3300': 5, '3301': 2 },
      reported: { '3300': 4 },
      known: 2,
      atV: 1,
    });
  });
});

describe('net worth', () => {
  const chars = board.characters;
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const worthOf = (total: number, liquid: number) => ({
    state: 'ready' as const,
    refreshedAt: NOW,
    data: { total, liquid },
  });

  it('sums net worth over the pilots that have one and says how many', () => {
    expect(netWorthTotals(chars)).toEqual({
      worth: { value: expect.closeTo(7_753_705_788.94, 1), covered: 3, total: 5 },
      liquid: { value: expect.closeTo(4_112_776_212.67, 1), covered: 3, total: 5 },
    });
    expect(netWorthTotals([bram!])).toEqual({ worth: null, liquid: null });
  });

  it('ranks shares by net worth, falling back to wallets when none has one', () => {
    expect(worthShares(chars).map((share) => [share.label, Math.round(share.count / 1e6)])).toEqual([
      ['Aurel Vantesse', 6588],
      ['Kessa Draymoor', 989],
      ['Torvin Hale', 177],
    ]);
    const noWorth = chars.map((c) => ({ ...c, netWorth: { state: 'pending' as const } }));
    expect(worthShares(noWorth).map((share) => share.label)).toEqual(['Aurel Vantesse', 'Kessa Draymoor', 'Torvin Hale']);
  });

  const journalOf = (windowStart: string, series: { t: number; balance: number }[]) => ({
    state: 'ready' as const,
    refreshedAt: NOW,
    data: { windowStart, inflow: 0, outflow: 0, series, recent: [] },
  });
  const pilot = {
    ...kessa!,
    characterId: 7,
    wallet: { state: 'ready' as const, refreshedAt: NOW, data: { balance: 40 } },
    journal: journalOf('2026-09-23T00:00:00.000Z', [
      { t: day('2026-09-23'), balance: 10 },
      { t: day('2026-09-25'), balance: 30 },
    ]),
    netWorth: worthOf(100, 40),
  };
  const history = [
    { day: '2026-09-26', netWorth: 90, liquidIsk: 35, included: 1, total: 1, pilots: { '7': { netWorth: 90, liquidIsk: 35 } } },
    { day: '2026-09-27', netWorth: 100, liquidIsk: 40, included: 1, total: 1, pilots: { '7': { netWorth: 100, liquidIsk: 40 } } },
  ];

  it('backfills ISK from the journal before the first recorded day, then stacks assets', () => {
    expect(accountWorthSeries(history, [pilot], NOW)).toEqual([
      { t: day('2026-09-23'), liquid: 10, assets: null },
      { t: day('2026-09-24'), liquid: 10, assets: null },
      { t: day('2026-09-25'), liquid: 30, assets: null },
      { t: day('2026-09-26'), liquid: 35, assets: 55 },
      { t: day('2026-09-27'), liquid: 40, assets: 60 },
    ]);
  });

  it("holds a pilot's last recorded worth on a day it is missing, and ignores pilots off the roster", () => {
    const other = { ...pilot, characterId: 8, journal: journalOf('2026-09-26T00:00:00.000Z', []) };
    const days: BoardHistoryDay[] = [
      { ...history[0]!, pilots: { '7': { netWorth: 90, liquidIsk: 35 }, '8': { netWorth: 1_000, liquidIsk: 5 }, '9': { netWorth: 50, liquidIsk: 1 } } },
      { ...history[1]!, pilots: { '7': { netWorth: 100, liquidIsk: 40 } } },
    ];
    expect(accountWorthSeries(days, [pilot, other], NOW).filter((point) => point.assets !== null)).toEqual([
      { t: day('2026-09-26'), liquid: 40, assets: 1_050 },
      { t: day('2026-09-27'), liquid: 45, assets: 1_055 },
    ]);
  });

  it('builds one pilot’s series from its own entry in each recorded day', () => {
    const skipped = [{ ...history[0]!, pilots: {} }, history[1]!];
    expect(pilotWorthSeries(skipped, pilot, NOW)).toEqual([
      { t: day('2026-09-23'), liquid: 10, assets: null },
      { t: day('2026-09-24'), liquid: 10, assets: null },
      { t: day('2026-09-25'), liquid: 30, assets: null },
      { t: day('2026-09-26'), liquid: 30, assets: null },
      { t: day('2026-09-27'), liquid: 40, assets: 60 },
    ]);
  });

  it('uses the recorded days alone once they reach back past the journal', () => {
    const series = accountWorthSeries(board.history, chars, NOW);
    expect(series).toHaveLength(board.history.length);
    expect(series.every((point) => point.assets !== null)).toBe(true);
  });
});

describe('worth chart mode', () => {
  const point = (liquid: number, assets: number | null) => ({ t: 0, liquid, assets });

  it('breaks the axis when net worth dwarfs ISK, stacks otherwise', () => {
    expect(worthChartMode([point(180e6, null), point(199.76e6, 3_140.24e6)])).toBe('broken');
    expect(worthChartMode([point(4_000e6, 3_500e6), point(4_110e6, 3_640e6)])).toBe('stacked');
    expect(worthChartMode([point(10, null), point(12, null)])).toBe('stacked');
    expect(worthChartMode(accountWorthSeries(board.history, board.characters, NOW))).toBe('stacked');
  });

  it('fits each segment to its own range', () => {
    const series = [point(100, null), point(200, 3_000), point(150, 3_050)];
    expect(splitDomains(series)).toEqual({ upper: [2_880, 3_520], lower: [90, 210] });
  });

  it('gives an all-zero ISK band a whole ISK either side of zero, not a fraction of one', () => {
    const series = [point(0, 3_000), point(0, 3_050)];
    expect(worthChartMode(series)).toBe('broken');
    expect(splitDomains(series).lower).toEqual([-1, 1]);
  });

  it('never fits a segment tighter than 5% of its midpoint, so a market wobble stays a ripple', () => {
    const series = [point(377e6, 4_043e6), point(379e6, 4_061e6), point(379e6, 4_041e6)];
    const { upper, lower } = splitDomains(series);
    expect(upper[1] - upper[0]).toBeCloseTo(0.05 * ((upper[0] + upper[1]) / 2));
    expect((upper[0] + upper[1]) / 2).toBeCloseTo(4_430e6);
    expect(lower[1] - lower[0]).toBeCloseTo(0.05 * 378e6);
  });
});
