import { readFile, readdir } from 'node:fs/promises';
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
    // Strictly descending numeric major.minor order — the master set itself is
    // pinned against the content directory by the inbox test below.
    const ranks = masters.map((m) => {
      const [major = 0, minor = 0] = m.version.split('.').map(Number);
      return major * 1_000 + minor;
    });
    expect(masters.length).toBeGreaterThan(1);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    expect(new Set(ranks).size).toBe(ranks.length);
    // The preamble file is read first, so the leading master still carries its title.
    expect(masters[0]?.title).toBe('Atlas of Worlds');
  });

  it('projects every real entry into exactly one browser document', async () => {
    const source = await readChangelogSource();
    const entries = parseChangelog(source);
    const documents = toChangelogDocuments(parseChangelogMasters(source));
    expect(documents.flatMap((document) => document.master.subVersions)).toEqual(entries);
  });

  // Fragments are retired. The loader's non-recursive readdir + vX.Y.md filter
  // still excludes content/changelog/pending/, so a leftover file there cannot
  // reach the live site.
  it('renders exactly the top-level vX.Y.md masters and never the pending inbox', async () => {
    const dir = join(process.cwd(), 'content', 'changelog');
    const entries = await readdir(dir, { withFileTypes: true });
    const masterVersions = entries
      .filter((entry) => entry.isFile() && /^v[\d.]+\.md$/.test(entry.name))
      .map((entry) => entry.name.slice(1, -3));
    const source = await readChangelogSource();
    const masters = parseChangelogMasters(source);
    expect(new Set(masters.map((master) => master.version))).toEqual(new Set(masterVersions));
    // The inbox is a real directory the loader deliberately steps over.
    expect(entries.some((entry) => entry.isDirectory() && entry.name === 'pending')).toBe(true);

    // Stronger guarantee: no pending fragment's bullet text ever reaches the
    // assembled source, so a future fold-into-an-existing-master regression that
    // left the master list unchanged would still be caught.
    const pendingDir = join(dir, 'pending');
    const fragments = (await readdir(pendingDir)).filter(
      (name) => name.endsWith('.md') && name !== 'README.md',
    );
    for (const fragment of fragments) {
      const body = await readFile(join(pendingDir, fragment), 'utf8');
      for (const bullet of body.split('\n').filter((line) => line.trimStart().startsWith('- '))) {
        expect(source).not.toContain(bullet.trim());
      }
    }
  });
});
