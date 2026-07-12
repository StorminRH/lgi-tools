import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheLife } from 'next/cache';
import { highlightTree } from './highlight';
import { parseDevlog } from './parse';
import type { DevlogTree } from './types';

// The dev log only changes on deploy, so cache the file read + parse + syntax
// highlight and let the build id invalidate it — this keeps /devlog in the static
// prerender shell instead of forcing the route dynamic on an uncached file read
// (the /changelog pattern). Highlighting runs here (server-side, once per deploy)
// so zero Shiki reaches the client; the tokens ride the cached tree as plain data.
export async function loadDevlog(): Promise<DevlogTree> {
  'use cache';
  cacheLife('max');
  const md = await readFile(join(process.cwd(), 'UNDER_THE_HOOD.md'), 'utf8');
  return highlightTree(parseDevlog(md));
}
