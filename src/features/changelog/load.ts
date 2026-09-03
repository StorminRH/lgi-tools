import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheLife } from 'next/cache';
import { type ChangelogMaster, parseChangelogMasters } from './parse';

const CHANGELOG_DIR = join(process.cwd(), 'content', 'changelog');

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

export async function readChangelogSource(): Promise<string> {
  const ordered = orderChangelogFiles(await readdir(CHANGELOG_DIR));
  const parts = await Promise.all(ordered.map((f) => readFile(join(CHANGELOG_DIR, f), 'utf8')));
  return parts.join('');
}

export async function loadChangelog(): Promise<ChangelogMaster[]> {
  'use cache';
  cacheLife('max');
  return parseChangelogMasters(await readChangelogSource());
}
