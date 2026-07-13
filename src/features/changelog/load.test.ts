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
    expect(masters[0]?.title).toBe('Undock Checklist');
  });

  it('projects every real entry into exactly one browser document', async () => {
    const source = await readChangelogSource();
    const entries = parseChangelog(source);
    const documents = toChangelogDocuments(parseChangelogMasters(source));
    expect(documents.flatMap((document) => document.master.subVersions)).toEqual(entries);
  });
});
