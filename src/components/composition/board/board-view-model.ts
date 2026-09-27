import {
  BOARD_GAPS,
  type BoardCharacter,
  type BoardGap,
  type BoardSection,
  type BoardSkillsData,
  type PlaceRef,
  type SkillCatalogGroup,
  type SystemRef,
} from '@/composition/board/api-contract';
import type { SkillQueueEntry } from '@/features/skill-queue/esi-projection';
import { type CurrentTraining, currentTraining, summarizeQueue } from '@/features/skill-queue/progress';
import { formatUtcDate, formatRemaining } from '@/lib/format/time';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const BOARD_LOAD_FAILED = 'Couldn’t load your characters — reload the page to try again.';

export type SectionState = BoardSection<unknown>['state'];

function readyData<T>(section: BoardSection<T>): T | null {
  return section.state === 'ready' ? section.data : null;
}

export interface CoveredSum {
  value: number;
  covered: number;
  total: number;
}

function coveredSum(values: readonly (number | null)[]): CoveredSum | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return {
    value: present.reduce((sum, value) => sum + value, 0),
    covered: present.length,
    total: values.length,
  };
}

export function coverageNote(sum: CoveredSum): string {
  return sum.covered < sum.total ? ` (${sum.covered} of ${sum.total})` : '';
}

export interface RosterTotals {
  pilots: number;
  isk: CoveredSum | null;
  sp: CoveredSum | null;
  training: number;
}

export function rosterTotals(characters: readonly BoardCharacter[], now: number): RosterTotals {
  return {
    pilots: characters.length,
    isk: coveredSum(characters.map((c) => readyData(c.wallet)?.balance ?? null)),
    sp: coveredSum(characters.map((c) => readyData(c.skills)?.totalSp ?? null)),
    training: characters.filter((c) => {
      const skills = readyData(c.skills);
      return skills !== null && currentTraining(skills.queue, now).kind === 'training';
    }).length,
  };
}

export type HealthTone = 'ok' | 'warn' | 'bad' | 'quiet';

export interface QueueHealth {
  tone: HealthTone;
  label: string;
}

const QUEUE_WARN_MS = DAY;

export function queueHealth(skills: BoardSection<BoardSkillsData>, now: number): QueueHealth {
  if (skills.state === 'pending') return { tone: 'quiet', label: 'Syncing from EVE…' };
  if (skills.state === 'reconnect') return { tone: 'quiet', label: 'Reconnect to sync skills' };
  const summary = summarizeQueue(skills.data.queue, now);
  switch (summary.kind) {
    case 'empty':
    case 'complete':
      return { tone: 'bad', label: 'Skill queue is empty' };
    case 'paused':
      return { tone: 'bad', label: 'Queue paused' };
    case 'active': {
      if (summary.finishesAt === null) return { tone: 'ok', label: 'Training' };
      const ms = summary.finishesAt - now;
      return { tone: ms < QUEUE_WARN_MS ? 'warn' : 'ok', label: `Queue ends in ${formatRemaining(ms)}` };
    }
  }
}

export function skillNames(catalog: readonly SkillCatalogGroup[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const group of catalog) {
    for (const skill of group.skills) names[String(skill.typeId)] = skill.name;
  }
  return names;
}

export interface BoardTileModel {
  characterId: number;
  name: string;
  portraitUrl: string;
  online: boolean | null;
  isk: number | null;
  totalSp: number | null;
  skillsState: SectionState;
  training: CurrentTraining | null;
  skillName: string | null;
  remainingLabel: string | null;
  health: QueueHealth;
  system: SystemRef | null;
  needsReconnect: boolean;
}

function trainingOf(
  skills: BoardSkillsData | null,
  names: Readonly<Record<string, string>>,
  now: number,
): Pick<BoardTileModel, 'training' | 'skillName' | 'remainingLabel'> {
  if (skills === null) return { training: null, skillName: null, remainingLabel: null };
  const training = currentTraining(skills.queue, now);
  const skillId = training.kind === 'training' || training.kind === 'paused' ? training.skillId : null;
  return {
    training,
    skillName: skillId !== null ? (names[String(skillId)] ?? null) : null,
    remainingLabel:
      training.kind === 'training' && Number.isFinite(training.finishesAt)
        ? formatRemaining(training.finishesAt - now)
        : null,
  };
}

export function tileModel(
  character: BoardCharacter,
  names: Readonly<Record<string, string>>,
  now: number,
): BoardTileModel {
  const skills = readyData(character.skills);
  const status = readyData(character.status);
  return {
    characterId: character.characterId,
    name: character.name,
    portraitUrl: character.portraitUrl,
    online: status?.online ?? null,
    isk: readyData(character.wallet)?.balance ?? null,
    totalSp: skills?.totalSp ?? null,
    skillsState: character.skills.state,
    ...trainingOf(skills, names, now),
    health: queueHealth(character.skills, now),
    system: status?.system ?? null,
    needsReconnect: character.gaps.length > 0,
  };
}

const GAP_PHRASE: Record<BoardGap, string> = {
  skills: 'skills',
  location: 'location',
  wallet: 'wallet',
  clones: 'clones',
  implants: 'implants',
  structures: 'structure names',
  industry: 'industry jobs',
};

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export function reconnectSentence(character: BoardCharacter): string | null {
  const { gaps, name } = character;
  if (gaps.length === 0) return null;
  if (gaps.length === BOARD_GAPS.length) return `Reconnect ${name} to start syncing it again.`;
  const ordered = BOARD_GAPS.filter((gap) => gaps.includes(gap));
  return `Reconnect ${name} to add ${joinList(ordered.map((gap) => GAP_PHRASE[gap]))}.`;
}

export type BoardView = { view: 'overview' } | { view: 'character'; characterId: number };

export const OVERVIEW: BoardView = { view: 'overview' };

const CHARACTER_PARAM = 'character';

/**
 * A lone pilot always gets its own sheet. With more, `?character=` picks one
 * and anything else (no param, an id not on this board) is the overview.
 */
export function boardViewFrom(
  param: string | null,
  characters: readonly Pick<BoardCharacter, 'characterId'>[],
): BoardView {
  const [only] = characters;
  if (characters.length === 1 && only !== undefined) return { view: 'character', characterId: only.characterId };
  if (param === null || !/^\d+$/.test(param)) return OVERVIEW;
  const characterId = Number(param);
  return characters.some((c) => c.characterId === characterId) ? { view: 'character', characterId } : OVERVIEW;
}

export type BoardTransitionType = 'board-focus' | 'board-overview' | 'board-switch';

/** Which way a view change runs, so the card swap can be keyed to it. */
export function boardTransitionType(from: BoardView, to: BoardView): BoardTransitionType {
  if (to.view === 'overview') return 'board-overview';
  return from.view === 'overview' ? 'board-focus' : 'board-switch';
}

/** The main pilot (the signed-in one, else the first linked) leads; the rest keep link order. */
export function railOrder<T extends Pick<BoardCharacter, 'characterId'>>(
  characters: readonly T[],
  mainId: number | null,
): T[] {
  const main = characters.find((c) => c.characterId === mainId) ?? characters[0];
  if (main === undefined) return [];
  return [main, ...characters.filter((c) => c !== main)];
}

/** The same page with `?character=` set for a character view or removed for the overview. */
export function boardViewHref(pathname: string, search: string, view: BoardView): string {
  const params = new URLSearchParams(search);
  if (view.view === 'character') params.set(CHARACTER_PARAM, String(view.characterId));
  else params.delete(CHARACTER_PARAM);
  const query = params.toString();
  return query === '' ? pathname : `${pathname}?${query.replace(/=(&|$)/g, '$1')}`;
}

export function characterParam(params: { get: (key: string) => string | null }): string | null {
  return params.get(CHARACTER_PARAM);
}

export interface SkillGroupSkill {
  typeId: number;
  name: string;
  level: number;
}

export interface SkillGroupModel {
  groupId: number;
  name: string;
  trained: number;
  total: number;
  atV: number;
  skills: SkillGroupSkill[];
}

export function groupSkills(
  levels: Readonly<Record<string, number>>,
  catalog: readonly SkillCatalogGroup[],
): SkillGroupModel[] {
  const groups: SkillGroupModel[] = [];
  for (const group of catalog) {
    const skills = group.skills
      .flatMap((skill) => {
        const level = levels[String(skill.typeId)];
        return level === undefined ? [] : [{ typeId: skill.typeId, name: skill.name, level }];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    if (skills.length === 0) continue;
    groups.push({
      groupId: group.groupId,
      name: group.name,
      trained: skills.length,
      total: group.skills.length,
      atV: skills.filter((skill) => skill.level === 5).length,
      skills,
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

const FLOW_WINDOW_MS = 30 * DAY;

export function flowWindowLabel(windowStart: string, now: number): string {
  const start = Date.parse(windowStart);
  if (!Number.isFinite(start) || now - start >= FLOW_WINDOW_MS - HOUR) return 'last 30 days';
  return `since ${formatUtcDate(windowStart)}`;
}

export interface BalanceChartModel {
  points: { x: number; y: number }[];
  labels: string[];
  domain: [number, number];
}

const DOMAIN_PADDING = 0.1;

export function fittedDomain(values: readonly number[]): [number, number] {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low || Math.abs(high) || 1) * DOMAIN_PADDING;
  return [low - pad, high + pad];
}

export function balanceChart(series: readonly { t: number; balance: number }[]): BalanceChartModel {
  const balances = series.map((point) => point.balance);
  return {
    points: balances.map((balance, index) => ({ x: index, y: balance })),
    labels: series.map((point) => formatUtcDate(new Date(point.t))),
    domain: fittedDomain(balances),
  };
}

const RECENT_JOURNAL_ROWS = 20;

export function recentJournal<Row extends { date: string }>(rows: readonly Row[]): Row[] {
  return [...rows].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, RECENT_JOURNAL_ROWS);
}

export function characterAge(birthday: string, now: number): string | null {
  const born = new Date(birthday);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date(now);
  let months =
    (today.getUTCFullYear() - born.getUTCFullYear()) * 12 + (today.getUTCMonth() - born.getUTCMonth());
  if (today.getUTCDate() < born.getUTCDate()) months -= 1;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest}m`;
  return rest === 0 ? `${years}y` : `${years}y ${rest}m`;
}

export function characterSecurityClass(securityStatus: number | null): string {
  if (securityStatus === null || securityStatus === 0) return 'text-muted';
  if (securityStatus >= 5) return 'text-sec-10';
  if (securityStatus > 0) return 'text-sec-08';
  if (securityStatus > -2) return 'text-sec-04';
  if (securityStatus > -5) return 'text-sec-03';
  return 'text-sec-02';
}

const SECTION_KEYS = [
  'skills',
  'profile',
  'status',
  'attributes',
  'implants',
  'clones',
  'wallet',
  'journal',
  'industry',
] as const satisfies readonly (keyof BoardCharacter)[];

export function boardIsCold(response: { characters: readonly BoardCharacter[] }): boolean {
  return response.characters.some((character) =>
    SECTION_KEYS.some((key) => character[key].state === 'pending'),
  );
}

export function placeName(place: PlaceRef): string {
  if (place.name !== null) return place.name;
  return place.kind === 'structure' ? 'Player structure' : `Station ${place.id}`;
}

export interface TimelineSegment {
  key: number;
  weight: number;
  training: boolean;
}

export interface QueueTimeline {
  segments: TimelineSegment[];
  endsAt: number;
}

export function queueTimeline(queue: readonly SkillQueueEntry[], now: number): QueueTimeline | null {
  const segments: TimelineSegment[] = [];
  let endsAt = now;
  for (const entry of queue) {
    if (entry.start_date === undefined || entry.finish_date === undefined) continue;
    const start = Date.parse(entry.start_date);
    const finish = Date.parse(entry.finish_date);
    if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= now) continue;
    segments.push({ key: entry.queue_position, weight: finish - Math.max(start, now), training: start <= now });
    endsAt = Math.max(endsAt, finish);
  }
  return segments.length === 0 ? null : { segments, endsAt };
}

export type AttentionKind = 'queue-empty' | 'queue-paused' | 'queue-ending' | 'jobs-ready' | 'reconnect';

export interface AttentionItem {
  kind: AttentionKind;
  characterId: number;
  name: string;
  text: string;
}

const ATTENTION_RANK: Record<AttentionKind, number> = {
  'queue-empty': 0,
  'queue-paused': 0,
  'queue-ending': 1,
  'jobs-ready': 2,
  reconnect: 3,
};

function queueAttention(character: BoardCharacter, now: number): (AttentionItem & { at: number }) | null {
  const skills = readyData(character.skills);
  if (skills === null) return null;
  const summary = summarizeQueue(skills.queue, now);
  const base = { characterId: character.characterId, name: character.name };
  if (summary.kind === 'empty' || summary.kind === 'complete') {
    return { ...base, kind: 'queue-empty', text: 'Skill queue is empty', at: 0 };
  }
  if (summary.kind === 'paused') return { ...base, kind: 'queue-paused', text: 'Skill queue is paused', at: 0 };
  if (summary.finishesAt !== null && summary.finishesAt - now < QUEUE_WARN_MS) {
    const ms = summary.finishesAt - now;
    return { ...base, kind: 'queue-ending', text: `Queue ends in ${formatRemaining(ms)}`, at: ms };
  }
  return null;
}

/** What needs doing across the roster, most urgent first; empty means all clear. */
export function attentionItems(characters: readonly BoardCharacter[], now: number): AttentionItem[] {
  const items: (AttentionItem & { at: number; order: number })[] = [];
  characters.forEach((character, order) => {
    const queue = queueAttention(character, now);
    if (queue !== null) items.push({ ...queue, order });
    const ready = readyData(character.industry)?.ready ?? 0;
    if (ready > 0) {
      items.push({
        kind: 'jobs-ready',
        characterId: character.characterId,
        name: character.name,
        text: `${ready} industry ${ready === 1 ? 'job' : 'jobs'} ready to deliver`,
        at: 0,
        order,
      });
    }
    const sentence = reconnectSentence(character);
    if (sentence !== null) {
      items.push({ kind: 'reconnect', characterId: character.characterId, name: character.name, text: sentence, at: 0, order });
    }
  });
  return items
    .sort((a, b) => ATTENTION_RANK[a.kind] - ATTENTION_RANK[b.kind] || a.at - b.at || a.order - b.order)
    .map(({ kind, characterId, name, text }) => ({ kind, characterId, name, text }));
}

/** Pilots by how soon they need a new skill: stalled queues first, then soonest end; unsynced last. */
export function trainingRows(characters: readonly BoardCharacter[], names: Readonly<Record<string, string>>, now: number) {
  const rank = (tile: BoardTileModel, endsAt: number | null): [number, number] => {
    if (tile.training === null) return [2, 0];
    if (tile.health.tone === 'bad') return [0, 0];
    return [1, endsAt ?? Number.POSITIVE_INFINITY];
  };
  return characters
    .map((character, order) => {
      const tile = tileModel(character, names, now);
      const skills = readyData(character.skills);
      const endsAt = skills === null ? null : summarizeQueue(skills.queue, now).finishesAt;
      return { tile, order, key: rank(tile, endsAt) };
    })
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.order - b.order)
    .map(({ tile }) => tile);
}

export interface CombinedFlow {
  inflow: number;
  outflow: number;
  label: string;
  covered: number;
  total: number;
}

/**
 * Money in and out summed across the journals that synced. The window is
 * the shortest one among them; when the windows differ the label says so,
 * because each pilot's total still covers its own window.
 */
export function combinedFlow(characters: readonly BoardCharacter[], now: number): CombinedFlow | null {
  const journals = characters.map((c) => readyData(c.journal));
  const present = journals.filter((journal) => journal !== null);
  if (present.length === 0) return null;
  const starts = present.map((journal) => Date.parse(journal.windowStart));
  const latest = Math.max(...starts);
  const aligned = Math.max(...starts) - Math.min(...starts) < DAY;
  const window = flowWindowLabel(new Date(latest).toISOString(), now);
  return {
    inflow: present.reduce((sum, journal) => sum + journal.inflow, 0),
    outflow: present.reduce((sum, journal) => sum + journal.outflow, 0),
    label: aligned ? window : `windows differ; shortest ${window}`,
    covered: present.length,
    total: characters.length,
  };
}

export interface IndustryTotals {
  active: number;
  ready: number;
  used: number;
  max: number;
  readyPilots: string[];
  covered: number;
  total: number;
}

export function industryTotals(characters: readonly BoardCharacter[]): IndustryTotals | null {
  const synced = characters
    .map((character) => ({ name: character.name, data: readyData(character.industry) }))
    .filter((row) => row.data !== null);
  if (synced.length === 0) return null;
  return {
    active: synced.reduce((sum, row) => sum + (row.data?.active ?? 0), 0),
    ready: synced.reduce((sum, row) => sum + (row.data?.ready ?? 0), 0),
    used: synced.reduce((sum, row) => sum + (row.data?.slots.used ?? 0), 0),
    max: synced.reduce((sum, row) => sum + (row.data?.slots.max ?? 0), 0),
    readyPilots: synced.filter((row) => (row.data?.ready ?? 0) > 0).map((row) => row.name),
    covered: synced.length,
    total: characters.length,
  };
}

export interface WalletShare {
  key: string;
  label: string;
  count: number;
}

export function walletShares(characters: readonly BoardCharacter[]): WalletShare[] {
  return characters.flatMap((character) => {
    const wallet = readyData(character.wallet);
    return wallet === null ? [] : [{ key: String(character.characterId), label: character.name, count: wallet.balance }];
  });
}

export interface WhereaboutsRow {
  characterId: number;
  name: string;
  status: { system: SystemRef; docked: string | null; ship: { typeId: number; typeName: string } } | null;
}

export function whereaboutsRows(characters: readonly BoardCharacter[]): WhereaboutsRow[] {
  return characters.map((character) => {
    const status = readyData(character.status);
    return {
      characterId: character.characterId,
      name: character.name,
      status:
        status === null
          ? null
          : {
              system: status.system,
              docked: status.dock === null ? null : placeName(status.dock),
              ship: { typeId: status.ship.typeId, typeName: status.ship.typeName },
            },
    };
  });
}
