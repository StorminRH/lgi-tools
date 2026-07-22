import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toChangelogDocuments } from './browser';
import { readChangelogSource } from './load';
import { parseChangelog, parseChangelogMasters } from './parse';

// The durable guard that the per-master split reassembles in the changelog's own order:
// the preamble leads (so the newest master keeps its themed title) and masters come out
// newest-first. This is also what pins a future changelog write to the right file — a new
// entry appends to content/changelog/vX.Y.md and still renders at the top.
describe('readChangelogSource', () => {
  it('reassembles masters newest-first with the preamble leading', async () => {
    const masters = parseChangelogMasters(await readChangelogSource());
    expect(masters.map((m) => m.version)).toEqual([
      '3.10',
      '3.9',
      '3.8',
      '3.7',
      '3.6',
      '3.4',
      '3.3',
      '3.2',
      '3.1',
      '3.0',
      '2.9',
    ]);
    // The preamble file is read first, so the leading master still carries its title.
    expect(masters[0]?.title).toBe('Hull Integrity');
  });

  it('projects every real entry into exactly one browser document', async () => {
    const source = await readChangelogSource();
    const entries = parseChangelog(source);
    const documents = toChangelogDocuments(parseChangelogMasters(source));
    expect(documents.flatMap((document) => document.master.subVersions)).toEqual(entries);
  });

  // The pending inbox (content/changelog/pending/) holds out-of-band release notes that
  // must never reach the live site until a planned release folds them in. The loader's
  // non-recursive readdir + vX.Y.md filter already excludes the subdirectory; this pins
  // that guarantee so a future loader change can't silently start rendering fragments.
  it('renders exactly the top-level vX.Y.md masters and never the pending inbox', async () => {
    const dir = join(process.cwd(), 'content', 'changelog');
    const entries = await readdir(dir, { withFileTypes: true });
    const masterVersions = entries
      .filter((entry) => entry.isFile() && /^v[\d.]+\.md$/.test(entry.name))
      .map((entry) => entry.name.slice(1, -3));
    const masters = parseChangelogMasters(await readChangelogSource());
    expect(new Set(masters.map((master) => master.version))).toEqual(new Set(masterVersions));
    // The inbox is a real directory the loader deliberately steps over.
    expect(entries.some((entry) => entry.isDirectory() && entry.name === 'pending')).toBe(true);
  });
});
