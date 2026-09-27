import { describe, expect, it } from 'vitest';
import { boardResponseSchema } from '@/composition/board/api-contract';
import { buildDemoBoard, FIXTURE_NOW } from '@/composition/board/demo-board';
import {
  balanceChart,
  characterAge,
  characterSecurityClass,
  coverageNote,
  defaultSelection,
  flowWindowLabel,
  groupSkills,
  parseRememberedSelection,
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

describe('defaultSelection', () => {
  const chars = board.characters;
  it('prefers the remembered pick, then the session character, then the first tile', () => {
    expect(defaultSelection(chars, kessa!.characterId, torvin!.characterId)).toBe(kessa!.characterId);
    expect(defaultSelection(chars, 42, torvin!.characterId)).toBe(torvin!.characterId);
    expect(defaultSelection(chars, null, 42)).toBe(aurel!.characterId);
    expect(defaultSelection([], null, null)).toBeNull();
  });

  it('parses only a positive integer from storage', () => {
    expect(parseRememberedSelection('9900000002')).toBe(9_900_000_002);
    expect(parseRememberedSelection(null)).toBeNull();
    expect(parseRememberedSelection('abc')).toBeNull();
    expect(parseRememberedSelection('-4')).toBeNull();
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
