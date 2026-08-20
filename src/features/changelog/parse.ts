import { isIsoCalendarDate } from '@/lib/iso-date';

const CHANGE_TYPES = ['Added', 'Changed', 'Fixed', 'Removed'] as const;

/** Closed changelog entry categories used for labels and semantic tones. */
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Titled group of related changelog bullet items. */
export type ChangelogGroup = {
  type: ChangeType;
  items: string[];
};

/** One dated sub-version changelog entry with overview prose and grouped details. */
export type ChangelogEntry = {
  version: string;
  date: string;
  summary: string[];
  groups: ChangelogGroup[];
};

/**
 * A master version groups all its sub-versions (a `### vX.Y.Z` entry). New
 * masters carry a themed title; historical ones render as a bare version number.
 */
export type ChangelogMaster = {
  version: string;
  title: string | null;
  summary: string[];
  subVersions: ChangelogEntry[];
};

const ENTRY_HEADING = /^###\s+v?([\d.]+)\s+[—-]\s+(\d{4}-\d{2}-\d{2})\s*$/;
const GROUP_HEADING = new RegExp(`^####\\s+(${CHANGE_TYPES.join('|')})\\s*$`);
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

function parseThemedMasterHeading(line: string): { master: string; title: string } | null {
  const match = line.match(/^##(?!#)\s+v?([\d.]+)\s+[—-]\s+(.+?)\s*$/);
  if (!match) return null;
  return { master: masterVersionOf(match[1] ?? ''), title: match[2] ?? '' };
}

function isReleaseOrGroupHeading(line: string): boolean {
  return line.startsWith('###');
}

function inEntryOverview(
  entry: ChangelogEntry | null,
  group: ChangelogGroup | null,
): entry is ChangelogEntry {
  return entry !== null && group === null;
}

/**
 * The master version is the first two dot-segments: '3.0.3.1' → '3.0',
 * '3.6.28' → '3.6'. A single-segment version returns itself unchanged.
 */
export function masterVersionOf(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

function createParagraphBuffer(onFlush: (paragraph: string) => void) {
  let lines: string[] = [];
  return {
    push(line: string) {
      lines.push(line);
    },
    flush() {
      if (lines.length > 0) onFlush(lines.join(' '));
      lines = [];
    },
  };
}

function appendOverviewLine(line: string, overview: ReturnType<typeof createParagraphBuffer>) {
  if (line === '') {
    overview.flush();
    return;
  }
  if (BULLET.test(line)) return;
  overview.push(line);
}

/**
 * Parses changelog Markdown into typed entries, rejecting malformed release
 * headings and dates.
 */
export function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let currentEntry: ChangelogEntry | null = null;
  let currentGroup: ChangelogGroup | null = null;
  const overview = createParagraphBuffer((paragraph) => {
    if (inEntryOverview(currentEntry, currentGroup)) {
      currentEntry.summary.push(paragraph);
    }
  });

  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();

    const entryHeading = parseEntryHeading(line);
    if (entryHeading) {
      overview.flush();
      currentEntry = { ...entryHeading, summary: [], groups: [] };
      currentGroup = null;
      entries.push(currentEntry);
      continue;
    }

    const groupMatch = line.match(GROUP_HEADING);
    if (groupMatch && currentEntry) {
      overview.flush();
      currentGroup = { type: groupMatch[1] as ChangeType, items: [] };
      currentEntry.groups.push(currentGroup);
      continue;
    }

    const bulletMatch = line.match(BULLET);
    if (bulletMatch && currentGroup) {
      currentGroup.items.push(bulletMatch[1] ?? '');
      continue;
    }

    if (inEntryOverview(currentEntry, currentGroup)) {
      appendOverviewLine(line, overview);
    }
  }

  overview.flush();
  return entries;
}

type MasterMeta = { titles: Map<string, string>; summaries: Map<string, string[]> };

function collectThemedMasterOverviews(md: string): MasterMeta {
  const titles = new Map<string, string>();
  const summaries = new Map<string, string[]>();
  let master: string | null = null;
  const overview = createParagraphBuffer((paragraph) => {
    if (master === null) return;
    const list = summaries.get(master) ?? [];
    list.push(paragraph);
    summaries.set(master, list);
  });
  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();
    const heading = parseThemedMasterHeading(line);
    if (heading) {
      overview.flush();
      master = heading.master;
      titles.set(heading.master, heading.title);
    } else if (master === null) {
      continue;
    } else if (isReleaseOrGroupHeading(line)) {
      overview.flush();
      master = null;
    } else if (line === '') {
      overview.flush();
    } else {
      overview.push(line);
    }
  }
  overview.flush();
  return { titles, summaries };
}

/** Groups dated entries under their two-segment master versions. */
export function parseChangelogMasters(md: string): ChangelogMaster[] {
  const { titles, summaries } = collectThemedMasterOverviews(md);
  const masters: ChangelogMaster[] = [];
  const byVersion = new Map<string, ChangelogMaster>();

  for (const entry of parseChangelog(md)) {
    const version = masterVersionOf(entry.version);
    let master = byVersion.get(version);
    if (!master) {
      master = {
        version,
        title: titles.get(version) ?? null,
        summary: summaries.get(version) ?? [],
        subVersions: [],
      };
      byVersion.set(version, master);
      masters.push(master);
    }
    master.subVersions.push(entry);
  }

  return masters;
}
