import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheLife } from 'next/cache';
import { type ChangelogMaster, parseChangelogMasters } from './parse';

// The changelog lives as one file per master version under content/changelog/ (plus a
// `_preamble.md` for the title/intro), so it stays editable without wrangling one huge
// file. The loader stitches them back into the single string the parser expects.
const CHANGELOG_DIR = join(process.cwd(), 'content', 'changelog');

// Render order = the changelog's source order: the preamble first, then masters
// newest-first (numeric compare of the two version segments). A new master's `vX.Y.md`
// drops in and auto-sorts to the top — no other file changes.
function orderChangelogFiles(files: string[]): string[] {
  const md = files.filter((f) => f.endsWith('.md'));
  const preamble = md.filter((f) => f === '_preamble.md');
  const verOf = (f: string) => f.slice(1, -3).split('.').map(Number);
  const masters = md
    .filter((f) => /^v[\d.]+\.md$/.test(f))
    .sort((a, b) => {
      const [a1 = 0, a2 = 0] = verOf(a);
      const [b1 = 0, b2 = 0] = verOf(b);
      return b1 - a1 || b2 - a2;
    });
  return [...preamble, ...masters];
}

// The changelog as one string, reassembled from its per-master files in render order.
// Concatenated with no separator, it reproduces the pre-split source byte-for-byte, so
// the parser stays untouched. Kept separate from the cached loader so tests can read it
// without entering a `use cache` scope.
export async function readChangelogSource(): Promise<string> {
  const ordered = orderChangelogFiles(await readdir(CHANGELOG_DIR));
  const parts = await Promise.all(ordered.map((f) => readFile(join(CHANGELOG_DIR, f), 'utf8')));
  return parts.join('');
}

// The changelog only changes on deploy, so cache the file reads + parse and let the
// build id invalidate it — this keeps /changelog in the static prerender shell instead
// of forcing the route dynamic on an uncached file read.
export async function loadChangelog(): Promise<ChangelogMaster[]> {
  'use cache';
  cacheLife('max');
  return parseChangelogMasters(await readChangelogSource());
}
