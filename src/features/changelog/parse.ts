// Tiny markdown parser for the restricted CHANGELOG.md format (a version
// timeline):
//   ### v<version> — <YYYY-MM-DD>   → new entry
//   #### <Added|Changed|Fixed|Removed>  → a change-type group in the entry
//   - <line>                        → a bullet under the current group
//   anything else                   → ignored
//
// Curated content + curated parser is the right pairing: a markdown library
// invites authors to use whatever syntax, then we get to write CSS for every
// variant. If a future entry genuinely needs richer formatting, grow this
// parser for exactly the new feature.

export const CHANGE_TYPES = ['Added', 'Changed', 'Fixed', 'Removed'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export type ChangelogGroup = {
  type: ChangeType;
  items: string[];
};

export type ChangelogEntry = {
  version: string;
  date: string;
  groups: ChangelogGroup[];
};

// A master version groups all its sub-versions (a `### vX.Y.Z` entry). New
// masters carry a themed title; historical ones render as a bare version number.
export type ChangelogMaster = {
  version: string;
  title: string | null;
  subVersions: ChangelogEntry[];
};

// `### v3.6.4 — 2026-06-14` — the version (with an optional leading `v`) and an
// ISO date, separated by an em-dash or hyphen.
const ENTRY_HEADING = /^###\s+v?([\d.]+)\s+[—-]\s+(\d{4}-\d{2}-\d{2})\s*$/;
const GROUP_HEADING = /^####\s+(Added|Changed|Fixed|Removed)\s*$/;
const BULLET = /^-\s+(.+)$/;

// `## v3.7 — Security Improvements / Industry Planner Upgrade` — an opt-in master
// theme heading. The version capture is `[\d.]+` like ENTRY_HEADING, so
// `## v3.7.0 — …` still themes master 3.7 once masterVersionOf collapses it.
// `^##\s+` can't match a `### …` entry line — the char after `##` there is `#`,
// not whitespace.
const MASTER_HEADING = /^##\s+v?([\d.]+)\s+[—-]\s+(.+?)\s*$/;

// The master version is the first two dot-segments: '3.0.3.1' → '3.0',
// '3.6.28' → '3.6'. A single-segment version returns itself unchanged.
export function masterVersionOf(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

export function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let currentEntry: ChangelogEntry | null = null;
  let currentGroup: ChangelogGroup | null = null;

  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();

    const entryMatch = line.match(ENTRY_HEADING);
    if (entryMatch) {
      currentEntry = { version: entryMatch[1], date: entryMatch[2], groups: [] };
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
      currentGroup.items.push(bulletMatch[1]);
    }
  }

  return entries;
}

// Groups the flat entries under their master version. The master grouping is
// derived from each entry's version prefix, so historical entries need no
// per-master heading; a `## vX.Y — …` heading only supplies the optional theme
// title. Masters come out newest-first and sub-versions newest-first, both
// straight from CHANGELOG.md's source order (an insertion-ordered Map). A themed
// heading with no matching entries is inert — it never produces a master.
export function parseChangelogMasters(md: string): ChangelogMaster[] {
  const titles = new Map<string, string>();
  for (const rawLine of md.split('\n')) {
    const masterMatch = rawLine.trim().match(MASTER_HEADING);
    if (masterMatch) titles.set(masterVersionOf(masterMatch[1]), masterMatch[2]);
  }

  const masters = new Map<string, ChangelogMaster>();
  for (const entry of parseChangelog(md)) {
    const version = masterVersionOf(entry.version);
    let master = masters.get(version);
    if (!master) {
      master = { version, title: titles.get(version) ?? null, subVersions: [] };
      masters.set(version, master);
    }
    master.subVersions.push(entry);
  }

  return [...masters.values()];
}
