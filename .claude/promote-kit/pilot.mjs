#!/usr/bin/env node
// pilot.mjs — keep one durable, admin E2E Pilot session per kit origin.
//
//   node pilot.mjs <origin> [<origin> ...] [--adopt <storageState.json>]... [--mint-origin <origin>]
//                  [--check] [--force-mint]
//
// For each origin (e.g. http://localhost:3101) the session lives in $KIT/state-<port>.json as a
// Playwright storageState. It is only (re)made when that file is missing or its session no longer
// works (GET <origin>/api/auth/get-session must return the e2e-pilot user):
//
//   1. adopt: a working session from another state-*.json in the kit, or from an --adopt file
//      (e.g. an earlier run's auth.json). Same database and secret, and the cookie is scoped to
//      host "localhost" with no port, so one session serves every local port. No reset happens.
//   2. mint ONCE: POST /api/dev/synthetic-pilot. That resets the pilot (revokes its other
//      sessions, recreates its user/account rows), so it runs at most once per call and the
//      result is written to every state-*.json the kit has. The route refuses to mint on a server
//      whose SUPERADMIN_CHARACTER_ID is the pilot (9000001), which the kit servers are, so it is
//      tried on the target origin first and then on --mint-origin (default http://localhost:3000,
//      the stack's own dev server, whose superadmin is someone else).
//
// Admin is not stored anywhere: the kit servers run with SUPERADMIN_CHARACTER_ID=9000001, which
// makes the pilot's session an admin session there. The script checks /admin/users to confirm
// (the admin cards render only for an admin) and reports it as `admin` in its JSON line.
//
// As a module: `import { ensurePilot } from './pilot.mjs'` → ensurePilot(origin, opts) → info.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT = path.dirname(fileURLToPath(import.meta.url));
const PILOT_USER_ID = 'e2e-pilot';
const MINT_PATH = '/api/dev/synthetic-pilot';
const DEFAULT_MINT_FALLBACK = 'http://localhost:3000';

export const statePath = (origin) => path.join(KIT, `state-${new URL(origin).port || '80'}.json`);

function request(method, url, headers = {}) {
  // node:http directly: these are localhost calls and must never go near the egress proxy.
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      { method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers, timeout: 180_000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout: ${method} ${url}`)));
    req.on('error', reject);
    req.end();
  });
}

const cookieHeader = (state) =>
  (state.cookies ?? [])
    .filter((c) => c.domain === 'localhost' || c.domain === '.localhost')
    .filter((c) => c.expires === -1 || c.expires === undefined || c.expires * 1000 > Date.now())
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

function readState(file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(state.cookies) ? state : null;
  } catch {
    return null;
  }
}

function writeState(file, state) {
  fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
}

/** The session's user on this origin, or null when the cookie no longer works there. */
export async function sessionUser(origin, state) {
  const cookie = cookieHeader(state);
  if (!cookie) return null;
  const res = await request('GET', `${origin}/api/auth/get-session`, { cookie, accept: 'application/json' });
  if (res.status !== 200) return null;
  try {
    const body = JSON.parse(res.body);
    return body?.user?.id === PILOT_USER_ID ? { ...body.user, expiresAt: body.session?.expiresAt } : null;
  } catch {
    return null;
  }
}

/**
 * Whether this origin treats the session as admin. /admin/users answers 200 to everyone (the
 * gate renders inside the page), so look for the admin cards' data-admin-card markers instead.
 */
export async function isAdminOn(origin, state) {
  const res = await request('GET', `${origin}/admin/users`, { cookie: cookieHeader(state), accept: 'text/html' });
  return res.status === 200 && res.body.includes('data-admin-card=');
}

function parseSetCookies(setCookie) {
  const now = Date.now();
  const cookies = [];
  for (const line of setCookie ?? []) {
    const [pair, ...attrs] = line.split(';').map((s) => s.trim());
    const eq = pair.indexOf('=');
    const cookie = {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: 'localhost',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    };
    let expired = false;
    for (const attr of attrs) {
      const [k, v = ''] = attr.split('=');
      const key = k.toLowerCase();
      if (key === 'max-age') {
        const age = Number(v);
        if (age <= 0) expired = true;
        cookie.expires = Math.floor(now / 1000) + age;
      } else if (key === 'expires' && cookie.expires === -1) {
        const t = Date.parse(v);
        if (Number.isFinite(t)) {
          if (t <= now) expired = true;
          cookie.expires = Math.floor(t / 1000);
        }
      } else if (key === 'path') cookie.path = v || '/';
      else if (key === 'domain') cookie.domain = v.replace(/^\./, '') || 'localhost';
      else if (key === 'httponly') cookie.httpOnly = true;
      else if (key === 'secure') cookie.secure = true;
      else if (key === 'samesite') cookie.sameSite = v[0]?.toUpperCase() + v.slice(1).toLowerCase();
    }
    if (!expired && cookie.value) cookies.push(cookie);
  }
  return { cookies, origins: [] };
}

async function mint(origin) {
  const res = await request('POST', `${origin}${MINT_PATH}`, {
    origin,
    host: new URL(origin).host,
    'content-length': '0',
  });
  if (res.status !== 303) {
    const hint = res.status === 500 ? ' (a server whose SUPERADMIN_CHARACTER_ID is 9000001 refuses to mint)' : '';
    throw new Error(`POST ${origin}${MINT_PATH} → ${res.status}${hint}`);
  }
  const setCookie = res.headers['set-cookie'];
  const state = parseSetCookies(Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []);
  if (!state.cookies.some((c) => c.name.endsWith('session_token'))) {
    throw new Error(`POST ${origin}${MINT_PATH} returned no session cookie`);
  }
  return state;
}

function kitStateFiles() {
  return fs
    .readdirSync(KIT)
    .filter((f) => /^state-\d+\.json$/.test(f))
    .map((f) => path.join(KIT, f));
}

/**
 * Make sure state-<port>.json holds a working pilot session for `origin`, reusing before minting.
 * Returns { origin, state, source, user, admin } where source is existing | adopted:<file> | minted@<origin>.
 */
export async function ensurePilot(origin, { adopt = [], mintOrigins, check = false, forceMint = false, quiet = false } = {}) {
  origin = new URL(origin).origin;
  const file = statePath(origin);
  const say = (msg) => quiet || console.error(`[pilot ${origin}] ${msg}`);
  let source = null;
  let state = null;
  let user = null;

  if (!forceMint) {
    const own = readState(file);
    if (own && (user = await sessionUser(origin, own))) {
      state = own;
      source = 'existing';
    } else {
      if (own) say(`${path.basename(file)} no longer works`);
      const candidates = [...kitStateFiles().filter((f) => f !== file), ...adopt];
      for (const candidate of candidates) {
        const s = readState(candidate);
        if (s && (user = await sessionUser(origin, s))) {
          state = { cookies: s.cookies.filter((c) => c.domain === 'localhost' || c.domain === '.localhost'), origins: [] };
          writeState(file, state);
          source = `adopted:${candidate}`;
          say(`adopted the working session in ${candidate}`);
          break;
        }
      }
    }
  }

  if (!state) {
    if (check) throw new Error(`no working pilot session for ${origin} (and --check forbids minting)`);
    const tries = mintOrigins ?? [origin, DEFAULT_MINT_FALLBACK];
    const errors = [];
    for (const mintOrigin of [...new Set(tries.map((o) => new URL(o).origin))]) {
      try {
        say(`minting via POST ${mintOrigin}${MINT_PATH} (resets the E2E Pilot once)`);
        state = await mint(mintOrigin);
        source = `minted@${mintOrigin}`;
        break;
      } catch (error) {
        errors.push(error.message);
        say(error.message);
      }
    }
    if (!state) throw new Error(`could not mint a pilot session: ${errors.join('; ')}`);
    user = await sessionUser(origin, state);
    if (!user) throw new Error(`minted session does not work on ${origin}`);
    // Minting revoked every older pilot session, so every kit state file gets the new one.
    for (const f of new Set([file, ...kitStateFiles()])) writeState(f, state);
  }

  const admin = await isAdminOn(origin, state);
  return { origin, state: file, source, user: { id: user.id, name: user.name, role: user.role }, expiresAt: user.expiresAt, admin };
}

async function main() {
  const args = process.argv.slice(2);
  const origins = [];
  const adopt = [];
  let mintOrigins;
  let check = false;
  let forceMint = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--adopt') adopt.push(path.resolve(args[++i]));
    else if (a.startsWith('--adopt=')) adopt.push(path.resolve(a.slice(8)));
    else if (a === '--mint-origin') (mintOrigins ??= []).push(args[++i]);
    else if (a.startsWith('--mint-origin=')) (mintOrigins ??= []).push(a.slice(14));
    else if (a === '--check') check = true;
    else if (a === '--force-mint') forceMint = true;
    else if (a === '-h' || a === '--help') {
      console.log('usage: node pilot.mjs <origin>... [--adopt file]... [--mint-origin origin]... [--check] [--force-mint]');
      return;
    } else origins.push(a);
  }
  if (origins.length === 0) origins.push('http://localhost:3101', 'http://localhost:3102');
  let failed = false;
  for (const [i, origin] of origins.entries()) {
    try {
      // Only the first origin may force a mint; the rest adopt that fresh session.
      const info = await ensurePilot(origin, { adopt, mintOrigins, check, forceMint: forceMint && i === 0 });
      console.log(JSON.stringify(info));
      if (!info.admin) {
        console.error(`[pilot ${origin}] warning: not admin here; is SUPERADMIN_CHARACTER_ID=9000001 set on this server?`);
      }
    } catch (error) {
      failed = true;
      console.error(`[pilot ${origin}] ${error.message}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
