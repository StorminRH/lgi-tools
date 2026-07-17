import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheLife } from 'next/cache';
import { highlightTree } from './highlight';
import { parseDevlog } from './parse';
import type { DevlogTree } from './types';

// The dev log lives as numbered chapter directories under content/devlog/, one file per
// document — plus a `_chapter.md` folder-heading file per chapter and the two loose
// top-level documents that precede the first chapter. Splitting the ~8.7k-line source
// this way keeps each document editable on its own.
const DEVLOG_DIR = join(process.cwd(), 'content', 'devlog');

const numPrefix = (name: string): number => {
  const m = name.match(/^(\d+)/);
  return m ? Number(m[1]) : -1;
};

/**
 * The dev log as one string, reassembled in nav order: top-level entries by numeric
 * prefix, each chapter as its heading file then its documents. Concatenated with no
 * separator it reproduces the pre-split source byte-for-byte, so the parser stays
 * untouched. Kept separate from the cached loader so tests can read it without entering
 * a `use cache` scope.
 */
export async function readDevlogSource(): Promise<string> {
  const top = await readdir(DEVLOG_DIR, { withFileTypes: true });
  top.sort((a, b) => numPrefix(a.name) - numPrefix(b.name));
  const paths: string[] = [];
  for (const entry of top) {
    if (entry.isDirectory()) {
      const chapterDir = join(DEVLOG_DIR, entry.name);
      const docs = (await readdir(chapterDir))
        .filter((f) => f.endsWith('.md') && f !== '_chapter.md')
        .sort((a, b) => numPrefix(a) - numPrefix(b));
      paths.push(join(chapterDir, '_chapter.md'), ...docs.map((d) => join(chapterDir, d)));
    } else if (entry.name.endsWith('.md')) {
      paths.push(join(DEVLOG_DIR, entry.name));
    }
  }
  const parts = await Promise.all(paths.map((p) => readFile(p, 'utf8')));
  return parts.join('');
}

/**
 * The dev log only changes on deploy, so cache the file reads + parse + syntax highlight
 * and let the build id invalidate it — this keeps /devlog in the static prerender shell
 * instead of forcing the route dynamic on an uncached file read (the /changelog pattern).
 * Highlighting runs here (server-side, once per deploy) so zero Shiki reaches the client;
 * the tokens ride the cached tree as plain data.
 */
export async function loadDevlog(): Promise<DevlogTree> {
  'use cache';
  cacheLife('max');
  return highlightTree(parseDevlog(await readDevlogSource()));
}
