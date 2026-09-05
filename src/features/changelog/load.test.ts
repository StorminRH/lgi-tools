import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toChangelogDocuments } from './browser';
import { readChangelogSource } from './load';
import { parseChangelog, parseChangelogMasters } from './parse';

describe('readChangelogSource', () => {
  it('reassembles masters newest-first with the preamble leading', async () => {
    const masters = parseChangelogMasters(await readChangelogSource());
    const ranks = masters.map((m) => {
      const [major = 0, minor = 0] = m.version.split('.').map(Number);
      return major * 1_000 + minor;
    });
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(masters[0]?.version).toBe('4.1');
    expect(masters[0]?.title).toBe('What is on the chain');
    expect(masters[0]?.subVersions[0]?.version).toBe('4.1.1');
  });

  it('projects every real entry into exactly one browser document', async () => {
    const source = await readChangelogSource();
    const entries = parseChangelog(source);
    const documents = toChangelogDocuments(parseChangelogMasters(source));
    expect(documents.flatMap((document) => document.master.subVersions)).toEqual(entries);
  });

  it('renders exactly the top-level vX.Y.md masters and never the pending inbox', async () => {
    const dir = join(process.cwd(), 'content', 'changelog');
    const entries = await readdir(dir, { withFileTypes: true });
    const masterVersions = entries
      .filter((entry) => entry.isFile() && /^v[\d.]+\.md$/.test(entry.name))
      .map((entry) => entry.name.slice(1, -3));
    const source = await readChangelogSource();
    const masters = parseChangelogMasters(source);
    expect(new Set(masters.map((master) => master.version))).toEqual(new Set(masterVersions));
    expect(entries.some((entry) => entry.isDirectory() && entry.name === 'pending')).toBe(true);

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
