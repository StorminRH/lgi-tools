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
  attentionItems,
  combinedFlow,
  industryTotals,
  railOrder,
  trainingRows,
  walletShares,
  whereaboutsRows,
  boardViewHref,
  characterParam,
  fittedDomain,
  flowWindowLabel,
  groupSkills,
  placeName,
  queueTimeline,
  boardIsCold,
  queueHealth,
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

  it('names the transition by where the view goes', () => {
    const aurelView = { view: 'character', characterId: 1 } as const;
    expect(boardTransitionType({ view: 'overview' }, aurelView)).toBe('board-focus');
    expect(boardTransitionType(aurelView, { view: 'overview' })).toBe('board-overview');
    expect(boardTransitionType(aurelView, { view: 'character', characterId: 2 })).toBe('board-switch');
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
    const groups = groupSkills(skills!.levels, board.skillCatalog);
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

  it('lists what needs doing, most urgent first', () => {
    expect(attentionItems(chars, NOW).map((item) => `${item.kind}:${item.name}`)).toEqual([
      'queue-paused:Torvin Hale',
      'queue-empty:Ilyana Mirek',
      'queue-ending:Kessa Draymoor',
      'jobs-ready:Aurel Vantesse',
      'jobs-ready:Torvin Hale',
      'reconnect:Ilyana Mirek',
      'reconnect:Bram Oskarsen',
    ]);
    expect(attentionItems(chars, NOW)[2]?.text).toBe('Queue ends in 9h');
    expect(attentionItems(chars, NOW)[3]?.text).toBe('1 industry job ready to deliver');
  });

  it('is all clear when nothing needs doing', () => {
    const calm = { ...aurel!, industry: { state: 'pending' as const } };
    expect(attentionItems([calm], NOW)).toEqual([]);
  });

  it('orders training by urgency, stalled queues first and unsynced last', () => {
    expect(trainingRows(chars, names, NOW).map((row) => row.name)).toEqual([
      'Torvin Hale',
      'Ilyana Mirek',
      'Kessa Draymoor',
      'Aurel Vantesse',
      'Bram Oskarsen',
    ]);
  });

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

  it('places each pilot, docked or in space', () => {
    const rows = whereaboutsRows(chars);
    expect(rows[0]?.status?.docked).toBe('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
    expect(rows[1]?.status?.docked).toBeNull();
    expect(rows[1]?.status?.ship.typeName).toBe('Ishtar');
    expect(rows[4]?.status).toBeNull();
  });
});
