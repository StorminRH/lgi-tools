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

export const SELECTION_STORAGE_KEY = 'lgi:home-board:selected';

export type SectionState = BoardSection<unknown>['state'];

function readyData<T>(section: BoardSection<T>): T | null {
  return section.state === 'ready' ? section.data : null;
}

/** A roster sum that says how many characters it covers, so a gap never reads as zero. */
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

/** "(3 of 5)" when some characters are missing from a sum, empty when all are in it. */
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

/** typeId → skill name, for the queue rows and the training line. */
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

/** A remembered pick wins, then the signed-in character, then the first tile. */
export function defaultSelection(
  characters: readonly BoardCharacter[],
  remembered: number | null,
  sessionCharacterId: number | null,
): number | null {
  const ids = new Set(characters.map((c) => c.characterId));
  if (remembered !== null && ids.has(remembered)) return remembered;
  if (sessionCharacterId !== null && ids.has(sessionCharacterId)) return sessionCharacterId;
  return characters[0]?.characterId ?? null;
}

export function parseRememberedSelection(raw: string | null): number | null {
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
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

/** Trained skills by catalog group; groups with nothing trained are left out. */
export function groupSkills(
  levels: Readonly<Record<string, number>>,
  catalog: readonly SkillCatalogGroup[],
): SkillGroupModel[] {
  const groups: SkillGroupModel[] = [];
  for (const group of catalog) {
    const skills = group.skills
      .filter((skill) => levels[String(skill.typeId)] !== undefined)
      .map((skill) => ({ typeId: skill.typeId, name: skill.name, level: levels[String(skill.typeId)] ?? 0 }))
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

/** "last 30 days", or "since <date>" when the journal does not reach back that far. */
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

/** Whole years and months since the birthday: "7y 2m". */
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

/** Character security status reads blue when positive and orange to red as it drops. */
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

/** A board with a section still syncing is worth one reconcile fetch. */
export function boardIsCold(response: { characters: readonly BoardCharacter[] }): boolean {
  return response.characters.some((character) =>
    SECTION_KEYS.some((key) => character[key].state === 'pending'),
  );
}

/** An inaccessible structure has no name; say what it is rather than show an id. */
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

/** Each unfinished queue entry as a share of the time left, for the timeline bar. */
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
