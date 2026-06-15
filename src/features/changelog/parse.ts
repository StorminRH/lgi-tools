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

// `### v3.7.0 — 2026-06-14` — the version (with an optional leading `v`) and an
// ISO date, separated by an em-dash or hyphen.
const ENTRY_HEADING = /^###\s+v?([\d.]+)\s+[—-]\s+(\d{4}-\d{2}-\d{2})\s*$/;
const GROUP_HEADING = /^####\s+(Added|Changed|Fixed|Removed)\s*$/;
const BULLET = /^-\s+(.+)$/;

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
