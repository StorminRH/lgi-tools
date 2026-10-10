import { paddedDomain } from '@/components/ui/chart/chart-geometry';
import {
  BOARD_GAPS,
  type BoardCharacter,
  type BoardGap,
  type BoardHistoryDay,
  type BoardSection,
  type BoardSkillsData,
  type PlaceRef,
  type SkillCatalogGroup,
  type SystemRef,
} from '@/composition/board/api-contract';
import type { SkillQueueEntry } from '@/features/skill-queue/esi-projection';
import {
  type CurrentTraining,
  currentTraining,
  entryTimes,
  isEntryFinished,
  summarizeQueue,
} from '@/features/skill-queue/progress';
import { unresolvedName } from '@/lib/format/names';
import { formatUtcDate, formatRemaining } from '@/lib/format/time';
import { DAY_MS, HOUR_MS, isoDayStartMs } from '@/lib/iso-date';
import { withSearchParams } from '@/lib/search-params';

/** A section's data once it is ready, or null while it is pending or needs a reconnect. */
export function readyData<T>(section: BoardSection<T>): T | null {
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

export type HealthTone = 'ok' | 'warn' | 'bad' | 'quiet';

export interface QueueHealth {
  tone: HealthTone;
  label: string;
}

const QUEUE_WARN_MS = DAY_MS;

export function queueHealth(skills: BoardSection<BoardSkillsData>, now: number): QueueHealth {
  if (skills.state === 'pending') return { tone: 'quiet', label: 'Syncing from EVE…' };
  if (skills.state === 'reconnect') return { tone: 'quiet', label: 'Reconnect to sync skills' };
  const summary = summarizeQueue(
    remainingQueue(skills.data.queue, now).map((row) => row.entry),
    now,
  );
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
    remainingLabel: training.kind === 'training' ? formatRemaining(training.finishesAt - now) : null,
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
  orders: 'market orders',
  assets: 'assets',
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

export type BoardTransitionType = 'board-open' | 'board-close';

/** Opening a pilot or closing back to the overview; the sequence runs each way. */
export function boardTransitionType(to: BoardView): BoardTransitionType {
  return to.view === 'overview' ? 'board-close' : 'board-open';
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
  return withSearchParams(pathname, search, {
    [CHARACTER_PARAM]: view.view === 'character' ? String(view.characterId) : null,
  });
}

export function characterParam(params: { get: (key: string) => string | null }): string | null {
  return params.get(CHARACTER_PARAM);
}

export interface EffectiveSkills {
  levels: Record<string, number>;
  /** The level ESI last reported, where a finished queue entry has since raised it. */
  reported: Record<string, number>;
  known: number;
  atV: number;
}

/**
 * Trained levels with finished queue entries applied. ESI's skill levels
 * often lag a finished entry until the pilot next logs in; the queue already
 * says it trained, so it counts, and the known and at-V totals follow.
 */
export function effectiveSkills(
  skills: Pick<BoardSkillsData, 'levels' | 'queue' | 'known' | 'atV'>,
  now: number,
): EffectiveSkills {
  const effective: EffectiveSkills = {
    levels: { ...skills.levels },
    reported: {},
    known: skills.known,
    atV: skills.atV,
  };
  for (const entry of skills.queue) {
    if (!isEntryFinished(entry, now)) continue;
    applyFinishedEntry(effective, skills.levels, entry);
  }
  return effective;
}

/** Raises one skill to a finished entry's level, counting a new skill or a new V. */
function applyFinishedEntry(
  effective: EffectiveSkills,
  esiLevels: Readonly<Record<string, number>>,
  entry: Pick<SkillQueueEntry, 'skill_id' | 'finished_level'>,
): void {
  const key = String(entry.skill_id);
  const before = effective.levels[key];
  if (before !== undefined && before >= entry.finished_level) return;
  if (!(key in effective.reported)) effective.reported[key] = esiLevels[key] ?? 0;
  if (esiLevels[key] === undefined && before === undefined) effective.known += 1;
  if (entry.finished_level === 5 && (before ?? 0) < 5) effective.atV += 1;
  effective.levels[key] = entry.finished_level;
}

export interface SkillGroupSkill {
  typeId: number;
  name: string;
  level: number;
  /** Set when a finished queue entry raised the level above what ESI reports. */
  reported: number | null;
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
  skills: Pick<EffectiveSkills, 'levels' | 'reported'>,
  catalog: readonly SkillCatalogGroup[],
): SkillGroupModel[] {
  const groups: SkillGroupModel[] = [];
  for (const group of catalog) {
    const trained = group.skills
      .flatMap((skill) => {
        const key = String(skill.typeId);
        const level = skills.levels[key];
        return level === undefined
          ? []
          : [{ typeId: skill.typeId, name: skill.name, level, reported: skills.reported[key] ?? null }];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    if (trained.length === 0) continue;
    groups.push({
      groupId: group.groupId,
      name: group.name,
      trained: trained.length,
      total: group.skills.length,
      atV: trained.filter((skill) => skill.level === 5).length,
      skills: trained,
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

const FLOW_WINDOW_MS = 30 * DAY_MS;

export function flowWindowLabel(windowStart: string, now: number): string {
  const start = Date.parse(windowStart);
  if (!Number.isFinite(start) || now - start >= FLOW_WINDOW_MS - HOUR_MS) return 'last 30 days';
  return `since ${formatUtcDate(windowStart)}`;
}

export interface BalanceChartModel {
  points: { x: number; y: number }[];
  labels: string[];
  domain: [number, number];
}

export function balanceChart(series: readonly { t: number; balance: number }[]): BalanceChartModel {
  const balances = series.map((point) => point.balance);
  return {
    points: balances.map((balance, index) => ({ x: index, y: balance })),
    labels: series.map((point) => formatUtcDate(point.t)),
    domain: paddedDomain(balances),
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
  'netWorth',
] as const satisfies readonly (keyof BoardCharacter)[];

export function boardIsCold(response: { characters: readonly BoardCharacter[] }): boolean {
  return response.characters.some((character) =>
    SECTION_KEYS.some((key) => character[key].state === 'pending'),
  );
}

export function placeName(place: PlaceRef): string {
  if (place.name !== null) return place.name;
  return place.kind === 'structure' ? 'Player structure' : unresolvedName('station', place.id);
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
    if (isEntryFinished(entry, now)) continue;
    const { start, finish } = entryTimes(entry);
    if (start === null || finish === null) continue;
    segments.push({ key: entry.queue_position, weight: finish - Math.max(start, now), training: start <= now });
    endsAt = Math.max(endsAt, finish);
  }
  return segments.length === 0 ? null : { segments, endsAt };
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
  const aligned = Math.max(...starts) - Math.min(...starts) < DAY_MS;
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

export interface WorthShare {
  key: string;
  label: string;
  count: number;
}

/**
 * Each pilot's share of the account, largest first: by estimated net worth
 * where any pilot has one, otherwise by wallet ISK.
 */
export function worthShares(characters: readonly BoardCharacter[]): WorthShare[] {
  const byWorth = characters.flatMap((character) => {
    const worth = readyData(character.netWorth);
    return worth === null ? [] : [{ key: String(character.characterId), label: character.name, count: worth.total }];
  });
  const shares =
    byWorth.length > 0
      ? byWorth
      : characters.flatMap((character) => {
          const wallet = readyData(character.wallet);
          return wallet === null
            ? []
            : [{ key: String(character.characterId), label: character.name, count: wallet.balance }];
        });
  return shares.sort((a, b) => b.count - a.count);
}

export interface NetWorthTotals {
  worth: CoveredSum | null;
  liquid: CoveredSum | null;
}

/** Estimated net worth over the pilots that have one, and wallet ISK over those with a wallet. */
export function netWorthTotals(characters: readonly BoardCharacter[]): NetWorthTotals {
  return {
    worth: coveredSum(characters.map((c) => readyData(c.netWorth)?.total ?? null)),
    liquid: coveredSum(characters.map((c) => readyData(c.wallet)?.balance ?? null)),
  };
}

export interface WorthPoint {
  t: number;
  liquid: number;
  /** Null before the first recorded day: only wallet ISK is known that far back. */
  assets: number | null;
}

// Recorded days, with the journal's wallet series filling in before the first
// one so a new account still sees its ISK; assets begin at the first snapshot.
function stackWorth(
  recorded: readonly { t: number; netWorth: number; liquid: number }[],
  backfill: readonly { t: number; balance: number }[],
): WorthPoint[] {
  const first = recorded[0]?.t ?? Number.POSITIVE_INFINITY;
  return [
    ...backfill.filter((point) => point.t < first).map((point) => ({ t: point.t, liquid: point.balance, assets: null })),
    ...recorded.map((day) => ({ t: day.t, liquid: day.liquid, assets: day.netWorth - day.liquid })),
  ];
}

/**
 * The account's net worth over time, ISK below and everything else above it. Each day sums every current
 * pilot's latest recorded worth by then, so a pilot missing from one night holds its last value instead of
 * dropping the total.
 */
export function accountWorthSeries(
  history: readonly BoardHistoryDay[],
  characters: readonly BoardCharacter[],
  now: number,
): WorthPoint[] {
  const roster = new Set(characters.map((character) => String(character.characterId)));
  const latest = new Map<string, BoardHistoryDay['pilots'][string]>();
  const recorded = history.flatMap((day) => {
    for (const [id, pilot] of Object.entries(day.pilots)) if (roster.has(id)) latest.set(id, pilot);
    if (latest.size === 0) return [];
    let netWorth = 0;
    let liquid = 0;
    for (const pilot of latest.values()) {
      netWorth += pilot.netWorth;
      liquid += pilot.liquidIsk;
    }
    return [{ t: isoDayStartMs(day.day), netWorth, liquid }];
  });
  return stackWorth(recorded, netWorthSeries(characters, now).points);
}

/** One pilot's net worth over time, from its entry in each recorded day. */
export function pilotWorthSeries(
  history: readonly BoardHistoryDay[],
  character: BoardCharacter,
  now: number,
): WorthPoint[] {
  const recorded = history.flatMap((day) => {
    const pilot = day.pilots[String(character.characterId)];
    return pilot === undefined ? [] : [{ t: isoDayStartMs(day.day), netWorth: pilot.netWorth, liquid: pilot.liquidIsk }];
  });
  return stackWorth(recorded, netWorthSeries([character], now).points);
}

export interface NetWorthSeries {
  points: { t: number; balance: number }[];
  from: number | null;
  included: number;
  of: number;
}

const startOfUtcDay = (t: number) => t - (((t % DAY_MS) + DAY_MS) % DAY_MS);

// The balance a pilot held at the end of a day: its last point by then, or,
// before its first point, that first point (its window opens no later).
function balanceBy(series: readonly { t: number; balance: number }[], end: number): number {
  let balance = series[0]?.balance ?? 0;
  for (const point of series) {
    if (point.t > end) break;
    balance = point.balance;
  }
  return balance;
}

/**
 * Combined wallet ISK per UTC day, over the window every included pilot
 * covers: it opens at the latest journal window start and never reaches back
 * before any pilot's own. Today's point is the current combined balance.
 */
export function netWorthSeries(characters: readonly BoardCharacter[], now: number): NetWorthSeries {
  const pilots = characters.flatMap((character) => {
    const journal = readyData(character.journal);
    const wallet = readyData(character.wallet);
    if (journal === null || wallet === null) return [];
    if (journal.series.length === 0 && journal.recent.length > 0) return [];
    const series = journal.series.length > 0
      ? journal.series
      : [{ t: Date.parse(journal.windowStart), balance: wallet.balance }];
    return [{ journal, wallet, series }];
  });
  const empty = { points: [], from: null, included: pilots.length, of: characters.length };
  if (pilots.length === 0) return empty;
  const from = Math.max(...pilots.map((pilot) => Date.parse(pilot.journal.windowStart)));
  const firstDay = startOfUtcDay(from);
  const today = startOfUtcDay(now);
  if (today - firstDay < DAY_MS) return { ...empty, from };
  const points: { t: number; balance: number }[] = [];
  for (let day = firstDay; day < today; day += DAY_MS) {
    const balance = pilots.reduce((sum, pilot) => sum + balanceBy(pilot.series, day + DAY_MS - 1), 0);
    points.push({ t: day, balance });
  }
  points.push({ t: today, balance: pilots.reduce((sum, pilot) => sum + pilot.wallet.balance, 0) });
  return { points, from, included: pilots.length, of: characters.length };
}

const QUEUE_WINDOW = 5;

export interface QueueRow {
  /** 1 for the entry in training, then counting on through what remains. */
  number: number;
  entry: SkillQueueEntry;
}

/** The queue without entries that finished since the last sync: those are never shown. */
export function remainingQueue(queue: readonly SkillQueueEntry[], now: number): QueueRow[] {
  return [...queue]
    .sort((a, b) => a.queue_position - b.queue_position)
    .filter((entry) => !isEntryFinished(entry, now))
    .map((entry, index) => ({ number: index + 1, entry }));
}

export interface QueueWindow {
  visible: QueueRow[];
  total: number;
}

/** The compact queue: the next entries still to train, in order, at most `size` of them. */
export function queueWindow(queue: readonly SkillQueueEntry[], now: number, size = QUEUE_WINDOW): QueueWindow {
  const remaining = remainingQueue(queue, now);
  return { visible: remaining.slice(0, size), total: remaining.length };
}

/** Net worth this many times the largest ISK value breaks the axis rather than squash ISK flat. */
const BREAK_AXIS_RATIO = 2;

export type WorthChartMode = 'stacked' | 'broken';

/**
 * Stacked bands while ISK and net worth share a scale; a broken axis once
 * every net-worth value is more than BREAK_AXIS_RATIO times the largest ISK
 * value, when a shared axis would flatten ISK to a sliver.
 */
export function worthChartMode(series: readonly WorthPoint[]): WorthChartMode {
  const worths = series.flatMap((point) => (point.assets === null ? [] : [point.liquid + point.assets]));
  if (worths.length === 0) return 'stacked';
  const topLiquid = Math.max(...series.map((point) => point.liquid));
  return Math.min(...worths) > BREAK_AXIS_RATIO * topLiquid ? 'broken' : 'stacked';
}

/**
 * A broken-axis band never spans less than this share of its midpoint: asset prices move with the market,
 * and a band fitted to a 0.5% wobble would draw it as a cliff.
 */
const MIN_BAND_SPAN = 0.05;

function bandDomain(values: readonly number[]): [number, number] {
  const [low, high] = paddedDomain(values);
  const mid = (low + high) / 2;
  const half = Math.max((high - low) / 2, (Math.abs(mid) * MIN_BAND_SPAN) / 2);
  return [mid - half, mid + half];
}

/** The two ranges of a broken axis, each at least MIN_BAND_SPAN tall: net worth above, ISK below. */
export function splitDomains(series: readonly WorthPoint[]): { upper: [number, number]; lower: [number, number] } {
  const worths = series.flatMap((point) => (point.assets === null ? [] : [point.liquid + point.assets]));
  return { upper: bandDomain(worths), lower: bandDomain(series.map((point) => point.liquid)) };
}
