/*
 * One-shot Sheet audit fetcher.
 *
 * Hits the published `pubhtml` URL to enumerate every tab the Sheet
 * exposes, then downloads each tab as CSV into ./raw/. Writes a
 * manifest at ./manifest.json. Re-running is idempotent — files are
 * overwritten.
 *
 * Run from the repo root:
 *   pnpm tsx sheet-audit/fetch-tabs.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

import { csvUrlFor } from '../src/features/wormhole-sites/sheet-source';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const RAW_DIR = join(HERE, 'raw');
const MANIFEST_PATH = join(HERE, 'manifest.json');

loadEnv({ path: join(REPO_ROOT, '.env.local') });

const SHEET_PUB_KEY = process.env.SHEET_PUB_KEY;
if (!SHEET_PUB_KEY) {
  console.error('SHEET_PUB_KEY missing — populate .env.local first.');
  process.exit(1);
}

function pubhtmlUrl(pubKey: string): string {
  return `https://docs.google.com/spreadsheets/d/e/${pubKey}/pubhtml`;
}

type Tab = { gid: string; label: string };

function parseTabsFromPubhtml(html: string): Tab[] {
  // Published pubhtml registers tabs as inline JS:
  //   items.push({name: "C2", pageUrl: "...?gid=152271063", gid: "152271063", initialSheet: ...})
  // The initial tab (typically gid="0") is set up separately without the
  // items.push wrapper and so has no `name:` field in this stream — we
  // recover it from collected gids minus already-named ones, and label it
  // best-effort from `<title>` or fall back to "Sheet <gid>".
  const seen = new Set<string>();
  const tabs: Tab[] = [];

  const nameGidRegex = /\bname:\s*"((?:[^"\\]|\\.)+)"[^}]*?\bgid:\s*"(\d+)"/g;
  for (const m of html.matchAll(nameGidRegex)) {
    const label = m[1].replace(/\\\//g, '/').replace(/\\"/g, '"');
    const gid = m[2];
    if (seen.has(gid)) continue;
    seen.add(gid);
    tabs.push({ gid, label });
  }

  // Pull all gids that appear in initialSheet lines / pageUrls; anything
  // not already named is the initial sheet.
  const allGidsRegex = /\bgid:\s*"(\d+)"/g;
  const allGids: string[] = [];
  for (const m of html.matchAll(allGidsRegex)) {
    if (!allGids.includes(m[1])) allGids.push(m[1]);
  }
  for (const gid of allGids) {
    if (seen.has(gid)) continue;
    seen.add(gid);
    // Prepend — the bare gid is the initial sheet, which Google renders
    // first in tab order. Default the label to a placeholder; the audit
    // doc will identify it manually.
    tabs.unshift({ gid, label: `(initial sheet gid=${gid})` });
  }

  return tabs;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  console.log('Fetching pubhtml…');
  const htmlRes = await fetch(pubhtmlUrl(SHEET_PUB_KEY!));
  if (!htmlRes.ok) {
    throw new Error(`pubhtml fetch failed: ${htmlRes.status}`);
  }
  const html = await htmlRes.text();
  const tabs = parseTabsFromPubhtml(html);
  console.log(`Found ${tabs.length} tabs.`);

  const manifest: { fetchedAt: string; tabs: { gid: string; label: string; path: string; bytes: number }[] } = {
    fetchedAt: new Date().toISOString(),
    tabs: [],
  };

  for (const tab of tabs) {
    const url = csvUrlFor(SHEET_PUB_KEY!, tab.gid);
    const fileName = `${tab.gid}-${slugify(tab.label) || 'tab'}.csv`;
    const outPath = join(RAW_DIR, fileName);
    process.stdout.write(`  ${tab.gid.padEnd(12)} ${tab.label.padEnd(28)} → ${fileName} … `);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`HTTP ${res.status}`);
        continue;
      }
      const csv = await res.text();
      await writeFile(outPath, csv, 'utf8');
      manifest.tabs.push({
        gid: tab.gid,
        label: tab.label,
        path: `raw/${fileName}`,
        bytes: csv.length,
      });
      console.log(`${csv.length} bytes`);
    } catch (err) {
      console.log(`error: ${(err as Error).message}`);
    }
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`\nManifest written: ${MANIFEST_PATH}`);
  console.log(`${manifest.tabs.length}/${tabs.length} tabs downloaded.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
