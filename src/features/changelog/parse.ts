// Tiny markdown parser for the restricted CHANGELOG.md format:
//   ### YYYY-MM-DD     → new entry
//   - <line>           → bullet under the current entry
//   anything else      → ignored
//
// Curated content + curated parser is the right pairing: a markdown library
// (marked, react-markdown) invites authors to use whatever syntax, then we
// get to write CSS for every variant. If a future entry genuinely needs
// richer formatting, grow this parser exactly the new feature.

export type ChangelogEntry = {
  date: string;
  items: string[];
};

const DATE_HEADING = /^###\s+(\d{4}-\d{2}-\d{2})\s*$/;
const BULLET = /^-\s+(.+)$/;

export function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;

  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();
    const dateMatch = line.match(DATE_HEADING);
    if (dateMatch) {
      current = { date: dateMatch[1], items: [] };
      entries.push(current);
      continue;
    }
    const bulletMatch = line.match(BULLET);
    if (bulletMatch && current) {
      current.items.push(bulletMatch[1]);
    }
  }

  return entries;
}
