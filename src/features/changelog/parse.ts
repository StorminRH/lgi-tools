import { isIsoCalendarDate } from '@/lib/iso-date';

// Tiny markdown parser for the restricted changelog format (content/changelog/*.md,
// reassembled by the loader — a version timeline):
//   ### v<version> — <YYYY-MM-DD>   → new entry
//   #### <Added|Changed|Fixed|Removed>  → a change-type group in the entry
//   - <line>                        → a bullet under the current group
//   anything else                   → ignored
//
// Curated content + curated parser is the right pairing: a markdown library
// invites authors to use whatever syntax, then we get to write CSS for every
// variant. If a future entry genuinely needs richer formatting, grow this
// parser for exactly the new feature.

/**
 * Closed changelog vocabulary and canonical order for change types; consumers derive validation
 * and iteration from this one list.
 */
export const CHANGE_TYPES = ['Added', 'Changed', 'Fixed', 'Removed'] as const;
/** Closed changelog entry categories used for labels and semantic tones. */
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Titled group of related changelog bullet items. */
export type ChangelogGroup = {
  type: ChangeType;
  items: string[];
};

/** One dated sub-version changelog entry with type, title, lead, and grouped details. */
export type ChangelogEntry = {
  version: string;
  date: string;
  groups: ChangelogGroup[];
};

/**
 * A master version groups all its sub-versions (a `### vX.Y.Z` entry). New
 * masters carry a themed title; historical ones render as a bare version number.
 * A master may also carry a short plain-language summary — the prose paragraph(s)
 * written directly under its `## vX.Y — Title` heading, before the first entry.
 */
export type ChangelogMaster = {
  version: string;
  title: string | null;
  summary: string[];
  subVersions: ChangelogEntry[];
};

// `### v3.6.4 — 2026-06-14` — the version (with an optional leading `v`) and an
// ISO date, separated by an em-dash or hyphen.
const ENTRY_HEADING = /^###\s+v?([\d.]+)\s+[—-]\s+(\d{4}-\d{2}-\d{2})\s*$/;
const GROUP_HEADING = /^####\s+(Added|Changed|Fixed|Removed)\s*$/;
const BULLET = /^-\s+(.+)$/;

function parseEntryHeading(line: string): Pick<ChangelogEntry, 'version' | 'date'> | null {
  const match = line.match(ENTRY_HEADING);
  if (!match) return null;

  const version = match[1] ?? '';
  const date = match[2] ?? '';
  if (!isIsoCalendarDate(date)) {
    throw new Error(`Changelog entry ${version} has an invalid date: ${date}`);
  }
  return { version, date };
}

// `## v3.7 — Security Improvements / Industry Planner Upgrade` — an opt-in master
// theme heading. The version capture is `[\d.]+` like ENTRY_HEADING, so
// `## v3.7.0 — …` still themes master 3.7 once masterVersionOf collapses it.
// `^##\s+` can't match a `### …` entry line — the char after `##` there is `#`,
// not whitespace.
const MASTER_HEADING = /^##\s+v?([\d.]+)\s+[—-]\s+(.+?)\s*$/;

/**
 * The master version is the first two dot-segments: '3.0.3.1' → '3.0',
 * '3.6.28' → '3.6'. A single-segment version returns itself unchanged.
 */
export function masterVersionOf(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

/**
 * Parses changelog Markdown into typed master and sub-version entries, rejecting malformed release
 * headings and dates.
 */
export function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let currentEntry: ChangelogEntry | null = null;
  let currentGroup: ChangelogGroup | null = null;

  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();

    const entryHeading = parseEntryHeading(line);
    if (entryHeading) {
      currentEntry = { ...entryHeading, groups: [] };
      currentGroup = null;
      entries.push(currentEntry);
      continue;
    }

    const groupMatch = line.match(GROUP_HEADING);
    if (groupMatch && currentEntry) {
      currentGroup = { type: groupMatch[1] as ChangeType, items: [] };
      currentEntry.groups.push(currentGroup);
      continue;
    }

    const bulletMatch = line.match(BULLET);
    if (bulletMatch && currentGroup) {
      currentGroup.items.push(bulletMatch[1] ?? '');
    }
  }

  return entries;
}

// A master heading's optional theme title and summary prose, keyed by master
// version. The summary is the paragraph(s) between a `## vX.Y — Title` heading and
// its first `### …` entry: blank-line-separated prose, each paragraph a string.
type MasterMeta = { titles: Map<string, string>; summaries: Map<string, string[]> };

function collectMasterMeta(md: string): MasterMeta {
  const titles = new Map<string, string>();
  const summaries = new Map<string, string[]>();
  let master: string | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (master && para.length) {
      const list = summaries.get(master) ?? [];
      list.push(para.join(' '));
      summaries.set(master, list);
    }
    para = [];
  };
  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();
    const masterMatch = line.match(MASTER_HEADING);
    if (masterMatch) {
      flushPara();
      master = masterVersionOf(masterMatch[1] ?? '');
      titles.set(master, masterMatch[2] ?? '');
    } else if (!master) {
      continue;
    } else if (line.startsWith('###')) {
      flushPara(); // an entry (or group) heading ends the summary region
      master = null;
    } else if (line === '') {
      flushPara();
    } else {
      para.push(line);
    }
  }
  flushPara();
  return { titles, summaries };
}

/**
 * Groups the flat entries under their master version. The master grouping is
 * derived from each entry's version prefix, so historical entries need no
 * per-master heading; a `## vX.Y — …` heading only supplies the optional theme
 * title and summary. Masters come out newest-first and sub-versions newest-first,
 * both straight from the changelog's source order (an insertion-ordered Map). A
 * themed heading with no matching entries is inert — it never produces a master.
 */
export function parseChangelogMasters(md: string): ChangelogMaster[] {
  const { titles, summaries } = collectMasterMeta(md);

  const masters = new Map<string, ChangelogMaster>();
  for (const entry of parseChangelog(md)) {
    const version = masterVersionOf(entry.version);
    let master = masters.get(version);
    if (!master) {
      master = {
        version,
        title: titles.get(version) ?? null,
        summary: summaries.get(version) ?? [],
        subVersions: [],
      };
      masters.set(version, master);
    }
    master.subVersions.push(entry);
  }

  return [...masters.values()];
}
