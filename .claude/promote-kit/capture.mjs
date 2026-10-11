#!/usr/bin/env node
// capture.mjs <shots.json> [--only name,name] [--side before|after] [--out dir] [--list]
//
// Runs every shot in the list on both kit servers with identical steps and writes
// <out>/<name>-before.png and <out>/<name>-after.png (or .txt for kind "head"), plus
// <out>/capture-notes.json with what each side saw (final URL, status, focus, region box,
// console errors, anything the steps put in `note`). See README.md for the shot format.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { KIT, ensurePilot, statePath } from './pilot.mjs';

// ---------------------------------------------------------------- playwright
function loadPlaywright() {
  const bases = [
    path.join(KIT, 'wt-new', 'package.json'),
    path.join(KIT, 'wt-old', 'package.json'),
    '/home/user/lgi-tools/package.json',
    path.join(process.cwd(), 'package.json'),
  ];
  for (const base of bases) {
    try {
      return createRequire(base)('playwright');
    } catch {
      /* try the next one */
    }
  }
  throw new Error("cannot resolve 'playwright' from the kit worktrees or the repo");
}
const { chromium, devices } = loadPlaywright();
const EXECUTABLE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

// ---------------------------------------------------------------- args + list
const args = process.argv.slice(2);
const listFile = args.find((a) => !a.startsWith('--') && !isFlagValue(a));
function isFlagValue(a) {
  const i = args.indexOf(a);
  return i > 0 && ['--only', '--side', '--out'].includes(args[i - 1]);
}
const flag = (name) => {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
};
if (!listFile) {
  console.error('usage: node capture.mjs <shots.json> [--only a,b] [--side before|after] [--out dir] [--list]');
  process.exit(2);
}
const listPath = path.resolve(listFile);
const raw = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const list = Array.isArray(raw) ? { shots: raw } : raw;
const listDir = path.dirname(listPath);
const OUT = flag('--out') ? path.resolve(flag('--out')) : path.resolve(listDir, list.out ?? 'shots');
const SIDES = list.sides ?? { before: 'http://localhost:3101', after: 'http://localhost:3102' };
const only = flag('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const sideFilter = flag('--side');
const shots = list.shots
  .map((shot) => ({ ...(list.defaults ?? {}), ...shot }))
  .filter((shot) => !only || only.includes(shot.name));

if (args.includes('--list')) {
  for (const shot of shots) console.log(`${shot.name}\t${shot.auth ?? 'signed-out'}\t${shot.path}`);
  process.exit(0);
}
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const HIDE_DEV_OVERLAY = 'nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }';

async function settle(page, timeout = 20_000) {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
}

async function activeElement(page) {
  return page
    .evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'body';
      const label = el.getAttribute('aria-label');
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${label ? `[aria-label="${label}"]` : ''}${text && !label ? ` "${text}"` : ''}`;
    })
    .catch(() => 'unknown');
}

function regionSpec(region) {
  if (region === undefined || region === null || region === 'viewport') return { mode: 'viewport' };
  if (region === 'fullPage') return { mode: 'fullPage' };
  const part = (x) => (typeof x === 'string' ? { selector: x } : x);
  if (typeof region === 'string') return { mode: 'locator', parts: [part(region)], pad: 16 };
  if (Array.isArray(region)) return { mode: 'locator', parts: region.map(part), pad: 16 };
  if (region.union) return { mode: 'locator', pad: 16, ...region, parts: region.union.map(part) };
  if (region.selector) return { mode: 'locator', pad: 16, ...region, parts: [region] };
  return { mode: region.fullPage ? 'fullPage' : 'viewport' };
}

function regionLocator(page, part) {
  let loc = page.locator(part.selector);
  if (part.hasText) loc = loc.filter({ hasText: part.hasText });
  loc = part.nth === undefined ? loc.first() : loc.nth(part.nth);
  if (part.ancestor) loc = loc.locator(`xpath=ancestor::${part.ancestor}[1]`);
  if (part.xpath) loc = loc.locator(`xpath=${part.xpath}`);
  return loc;
}

const docRect = (loc) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  });

function unionRect(rects) {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width));
  const y1 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Screenshot one element, or the union box of several, with padding. The box is centred in the
 * viewport first so a sticky header does not cover it; a box taller than the viewport (or with
 * fullPage) comes from a full-page capture clipped to its document position, scrolled to the top.
 */
async function shootRegion(page, locs, file, { pad = 16, fullPage = false, ...opts }) {
  for (const loc of locs) await loc.waitFor({ state: 'visible', timeout: 60_000 });
  const vp = page.viewportSize();
  let doc = unionRect(await Promise.all(locs.map(docRect)));
  if (!fullPage && doc.height + 2 * pad <= vp.height) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, doc.y - (vp.height - doc.height) / 2));
    await sleep(300);
    const box = unionRect(await Promise.all(locs.map(async (l) => l.boundingBox())));
    const clip = {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
    };
    clip.width = Math.min(vp.width, box.x + box.width + pad) - clip.x;
    clip.height = Math.min(vp.height, box.y + box.height + pad) - clip.y;
    if (box.y >= 0 && box.y + box.height <= vp.height) {
      await page.screenshot({ ...opts, path: file, clip });
      return box;
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  doc = unionRect(await Promise.all(locs.map(docRect)));
  const x = Math.max(0, doc.x - pad);
  const y = Math.max(0, doc.y - pad);
  await page.screenshot({ ...opts, path: file, fullPage: true, clip: { x, y, width: Math.min(vp.width - x, doc.width + 2 * pad), height: doc.height + 2 * pad } });
  return { ...doc, fullPage: true };
}

function globOrRegex(url) {
  if (typeof url === 'string' && url.startsWith('/') && url.lastIndexOf('/') > 0) {
    const end = url.lastIndexOf('/');
    return new RegExp(url.slice(1, end), url.slice(end + 1));
  }
  return url;
}

// EVE's image CDN is outside the sandbox: by default every portrait/logo/type icon becomes the
// same flat grey pixel on both sides ("images": "blank"), so no broken-image glyphs and no
// network wait. "block" aborts them instead (shows the app's failure fallbacks); "allow" lets them through.
const EVE_IMAGES = '**://images.evetech.net/**';
const GREY_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQNrQCAAEhAJegKFHLAAAAAElFTkSuQmCC', 'base64');

async function installRoutes(page, shot, note) {
  const images = shot.images ?? 'blank';
  if (images === 'blank') await page.route(EVE_IMAGES, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: GREY_PIXEL }));
  else if (images === 'block') await page.route(EVE_IMAGES, (route) => route.abort('blockedbyclient'));
  for (const pattern of shot.block ?? []) {
    await page.route(globOrRegex(pattern), (route) => route.abort('blockedbyclient'));
  }
  for (const stub of shot.stubs ?? []) {
    let hits = 0;
    const transform = stub.transform ? new Function('json', 'request', stub.transform) : null;
    await page.route(globOrRegex(stub.url), async (route) => {
      const request = route.request();
      if (stub.method && request.method() !== stub.method.toUpperCase()) return route.fallback();
      if (stub.times !== undefined && hits >= stub.times) return route.fallback();
      hits += 1;
      note.stubHits = { ...(note.stubHits ?? {}), [stub.url]: hits };
      if (stub.hold) return; // never answered: shows loading states
      if (stub.abort) return route.abort('failed');
      if (stub.delayMs) await sleep(stub.delayMs);
      if (transform) {
        const response = await route.fetch();
        const json = transform(await response.json(), request);
        return route.fulfill({ response, json });
      }
      const body = stub.file ? fs.readFileSync(path.resolve(listDir, stub.file)) : stub.body;
      return route.fulfill({
        status: stub.status ?? 200,
        headers: stub.headers,
        contentType: stub.contentType ?? (stub.json !== undefined ? 'application/json' : undefined),
        ...(stub.json !== undefined ? { json: stub.json } : { body: body ?? '' }),
      });
    });
  }
}

async function runActions(page, base, actions, ctx) {
  for (const action of actions) {
    const [verb] = Object.keys(action).filter((k) => !['times', 'timeout', 'delay'].includes(k));
    const value = action[verb];
    const times = action.times ?? 1;
    for (let i = 0; i < times; i++) {
      switch (verb) {
        case 'goto': await page.goto(new URL(value, base).href); await settle(page); break;
        case 'click': await page.locator(value).first().click({ timeout: action.timeout ?? 30_000 }); break;
        case 'dblclick': await page.locator(value).first().dblclick(); break;
        case 'hover': await page.locator(value).first().hover(); break;
        case 'focus': await page.locator(value).first().focus(); break;
        case 'tap': await page.locator(value).first().tap(); break;
        case 'press': await page.keyboard.press(value); break;
        case 'type': await page.keyboard.type(value, { delay: action.delay ?? 20 }); break;
        case 'fill': await page.locator(value[0]).first().fill(value[1]); break;
        case 'select': await page.locator(value[0]).first().selectOption(value[1]); break;
        case 'check': await page.locator(value).first().check(); break;
        case 'wait': await sleep(value); break;
        case 'waitFor': await page.locator(value).first().waitFor({ timeout: action.timeout ?? 60_000 }); break;
        case 'waitForText': await page.getByText(value).first().waitFor({ timeout: action.timeout ?? 60_000 }); break;
        case 'scroll': await page.locator(value).first().evaluate((el) => el.scrollIntoView({ block: 'center' })); break;
        case 'mouse': await page.mouse.move(value[0], value[1], { steps: 5 }); break;
        case 'mouseAway': await page.mouse.move(1, 1); break;
        case 'settle': await settle(page, value || 20_000); break;
        case 'eval': ctx.note.eval = await page.evaluate(value); break;
        case 'reload': await page.reload(); await settle(page); break;
        default: throw new Error(`unknown action ${JSON.stringify(action)}`);
      }
    }
  }
}

function extractHeadTags(html) {
  const headEnd = html.search(/<\/head>/i);
  const out = [];
  const re = /<title[^>]*>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b[^>]*rel="(?:canonical|alternate|icon|apple-touch-icon|manifest)"[^>]*>|<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const where = headEnd >= 0 && m.index < headEnd ? 'head' : 'body';
    out.push(`[${where}] ${m[0].replace(/\s+/g, ' ')}`);
  }
  return out;
}

// ---------------------------------------------------------------- one side
async function contextOptions(shot, origin) {
  const opts = shot.device
    ? { ...devices[shot.device] }
    : { viewport: shot.viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: shot.deviceScaleFactor ?? 1 };
  if (shot.colorScheme) opts.colorScheme = shot.colorScheme;
  if (shot.reducedMotion) opts.reducedMotion = shot.reducedMotion;
  if (shot.locale) opts.locale = shot.locale;
  if (shot.timezoneId) opts.timezoneId = shot.timezoneId;
  if (shot.userAgent) opts.userAgent = shot.userAgent;
  const auth = shot.auth ?? 'signed-out';
  if (auth === 'pilot' || auth === 'admin') {
    const info = await ensurePilot(origin, { quiet: true });
    if (auth === 'admin' && !info.admin) throw new Error(`${origin} does not treat the pilot as admin (SUPERADMIN_CHARACTER_ID=9000001?)`);
    opts.storageState = statePath(origin);
  } else if (auth !== 'signed-out') {
    throw new Error(`unknown auth ${auth}`);
  }
  return opts;
}

async function captureSide(browser, shot, side, origin) {
  const note = { origin, auth: shot.auth ?? 'signed-out' };
  const started = Date.now();
  const kind = shot.kind ?? 'png';
  const file = path.join(OUT, `${shot.name}-${side}.${kind === 'head' ? 'txt' : 'png'}`);
  const context = await browser.newContext(await contextOptions(shot, origin));
  const page = await context.newPage();
  page.setDefaultTimeout(shot.timeout ?? 60_000);
  const consoleErrors = [];
  page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text().slice(0, 200)));
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 200)}`));
  try {
    await installRoutes(page, shot, note);
    const url = new URL(shot.path, origin).href;
    if (kind === 'head') {
      const res = await context.request.get(url, { headers: shot.userAgent ? { 'user-agent': shot.userAgent } : {}, maxRedirects: 0 });
      const html = await res.text();
      const lines = [`# ${shot.name} (${side}) ${url}`, `# status ${res.status()}`, ...extractHeadTags(html)];
      fs.writeFileSync(file, `${lines.join('\n')}\n`);
      note.status = res.status();
      return { file, note };
    }
    if (shot.hideDevOverlay !== false) await context.addInitScript((css) => {
      const add = () => {
        const style = document.createElement('style');
        style.textContent = css;
        document.documentElement.appendChild(style);
      };
      if (document.documentElement) add();
      else document.addEventListener('DOMContentLoaded', add);
    }, HIDE_DEV_OVERLAY);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: shot.gotoTimeout ?? 180_000 });
    note.status = response?.status();
    await settle(page, shot.settleTimeout ?? 20_000);
    for (const sel of [].concat(shot.waitFor ?? [])) await page.locator(sel).first().waitFor({ timeout: 90_000 });
    if (shot.mouseAway !== false && !shot.device) await page.mouse.move(1, 1);
    const ctx = { page, context, base: origin, origin, side, shot, sleep, note, settle: () => settle(page), activeElement: () => activeElement(page) };
    if (typeof shot.steps === 'string') await new AsyncFunction('ctx', `const { page, context, base, side, shot, sleep, note, settle } = ctx;\n${shot.steps}`)(ctx);
    else if (Array.isArray(shot.steps)) await runActions(page, origin, shot.steps, ctx);
    if (shot.settleMs) await sleep(shot.settleMs);
    note.finalUrl = page.url();
    note.focus = await activeElement(page);
    const spec = regionSpec(shot.region);
    const shotOpts = { animations: shot.animations ?? 'disabled', caret: 'hide' };
    if (spec.mode === 'locator') {
      note.region = await shootRegion(page, spec.parts.map((part) => regionLocator(page, part)), file, { pad: spec.pad, fullPage: spec.fullPage, ...shotOpts });
    } else {
      await page.screenshot({ ...shotOpts, path: file, fullPage: spec.mode === 'fullPage' });
    }
    return { file, note };
  } catch (error) {
    note.error = String(error?.message ?? error).split('\n')[0];
    await page.screenshot({ path: path.join(OUT, `${shot.name}-${side}-error.png`) }).catch(() => {});
    return { file: null, note };
  } finally {
    note.consoleErrors = consoleErrors.slice(0, 8);
    note.ms = Date.now() - started;
    await context.close();
  }
}

// ---------------------------------------------------------------- main
// List-level setup/teardown run once around the whole run; shot-level ones run around that shot
// (both sides). Commands run with bash in the shot list's directory; teardown runs even on failure.
function runHooks(kind, owner = list, label = kind) {
  for (const cmd of owner[kind] ?? []) {
    console.error(`[capture] ${label}: ${cmd}`);
    execSync(cmd, { cwd: listDir, stdio: 'inherit', shell: '/bin/bash' });
  }
}

const notesFile = path.join(OUT, 'capture-notes.json');
const notes = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) : {};
const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true });
let failed = 0;
try {
  runHooks('setup');
  for (const shot of shots) {
    notes[shot.name] = { path: shot.path, ...(notes[shot.name] ?? {}) };
    try {
      runHooks('setup', shot, `${shot.name} setup`);
      for (const [side, origin] of Object.entries(SIDES)) {
        if (sideFilter && side !== sideFilter) continue;
        const { file, note } = await captureSide(browser, shot, side, origin);
        notes[shot.name][side] = note;
        if (file) console.log(`${shot.name} ${side}: ${file}`);
        else {
          failed += 1;
          console.error(`${shot.name} ${side}: FAILED ${note.error}`);
        }
      }
    } finally {
      runHooks('teardown', shot, `${shot.name} teardown`);
    }
    fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2));
  }
} finally {
  try {
    runHooks('teardown');
  } finally {
    await browser.close();
  }
}
process.exitCode = failed ? 1 : 0;
