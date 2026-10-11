# Before/after screenshot kit

This kit captures the same page on two refs of LGI.tools, so a reviewer can compare a PR's
before and after screenshots.

- OLD is served from `wt-old` on http://localhost:3101.
- NEW is served from `wt-new` on http://localhost:3102.

Both servers run `next dev` against the local stack: Postgres on :5433 and Convex on :3210.
They share that database with the stack's own dev server on :3000.

Rules the kit follows. Keep to them when you extend it:

- **Never touch the main checkout** (`/home/user/lgi-tools`). The kit only runs `git fetch`,
  `git worktree add/remove/prune` and read-only git commands there. All edits happen in
  `wt-old` and `wt-new`.
- **Never stop the stack.** That means :3000, :5433 and :3210. `down.sh` only signals process
  groups that `up.sh` recorded and whose processes run inside this kit directory.
- **Local data only.** Never point the kit at staging, production or Neon. `up.sh` sets
  `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `DATABASE_MIGRATION_URL` to
  `postgres://lgi:lgi@localhost:5433/lgi_tools` explicitly. `db.sh` only connects there.
- **Never print `.env.local`.** `up.sh` copies it into each worktree with mode 600.

## Files

| File | What it does |
| --- | --- |
| `up.sh <old-ref> <new-ref>` | Runs `git fetch` first. Creates or resets `wt-old` and `wt-new`. Reinstalls only when `pnpm-lock.yaml` changed. Restarts both servers in the background and waits until both answer. |
| `down.sh [--side old\|new] [--remove]` | Stops the servers by process group. Keeps the worktrees unless `--remove` is passed. |
| `pilot.mjs [origin...]` | Keeps one long-lived E2E Pilot session per port in `state-<port>.json`. The pilot is an admin on the kit servers. |
| `capture.mjs <list.json>` | Runs every shot in a JSON shot list on both servers, with identical steps. Writes `<out>/<name>-before.png` and `-after.png` (or `.txt`), plus `capture-notes.json`. |
| `inspect.mjs <origin> <path> [selector]` | Prints the elements that match a selector, with their size and ancestor chain. Use it to find a `region`. |
| `db.sh` | Runs `psql` against the local database only. Also has `snapshot` and `restore` for mocked rows. |
| `worktree-patch.sh apply <patch>\|revert` | Applies the same temporary code edit to both worktrees, or reverts it. |
| `lists/` | Shot lists. `example.json` shows the shot types; `p012.json` and `p318.json` are real ones. |
| `mocks/` | SQL and patches the shot lists use. Also holds row snapshots taken before a mock. |
| `pids/` | `<side>.pgid` (the process group `down.sh` kills), `.pid` (the wrapper), `.port`, `.ref` and `.sha`. |
| `dev-old.log`, `dev-new.log`, `install-*.log` | Server and install logs. |

## Next PR, step by step

```bash
KIT=/tmp/claude-0/-home-user-lgi-tools/028cfc65-51f4-569e-b16e-f40cd797311d/scratchpad/review-kit

# 1. Serve both refs. Any ref works: origin/staging, origin/development, origin/<pr-branch>, a SHA.
#    For one PR, OLD is usually its base (or `git merge-base`) and NEW is its head.
$KIT/up.sh origin/staging origin/development
#    If you rerun it, it stops the old servers, resets the worktrees and skips pnpm install
#    when the lockfile has not changed. It warns when drizzle/ or convex/ differ between the
#    refs, because the shared DB and Convex then match only one side.

# 2. Optional: capture.mjs does this itself for auth "pilot" or "admin".
node $KIT/pilot.mjs                 # checks or creates state-3101.json and state-3102.json

# 3. Write a shot list. Copy lists/example.json. Find selectors with:
node $KIT/inspect.mjs http://localhost:3102 /admin/users/e2e-pilot '[data-admin-card]' --auth admin

# 4. Capture. Run it from anywhere; relative paths resolve against the list file.
node $KIT/capture.mjs $KIT/lists/my-pr.json                # every shot, both sides
node $KIT/capture.mjs $KIT/lists/my-pr.json --only a,b --side after

# 5. Look at <out>/*.png. <out>/capture-notes.json records, for each side, the status, the final
#    URL, which element had focus, the region box, console errors, stub hits, and anything the
#    steps wrote to `note`.

# 6. When you are done:
$KIT/down.sh            # stop both servers, keep the worktrees and node_modules for next time
$KIT/down.sh --remove   # also remove the worktrees
```

Playwright comes from the worktrees (`createRequire(wt-new/package.json)`). It runs the
browser at `/opt/pw-browsers/chromium`; override that with `PW_CHROMIUM`. Nothing is installed
or copied into the repo.

## Auth: the long-lived admin E2E Pilot

- The pilot is the synthetic user `e2e-pilot`, character 9000001.
- Both kit servers run with `SUPERADMIN_CHARACTER_ID=9000001`, so its session is an admin
  session there. On :3000 it is an ordinary user. `pilot.mjs` checks admin by looking for the
  admin cards on `/admin/users`. Do not use the HTTP status: that page answers 200 to everyone.
- The session cookie (`better-auth.session_token`) is set for the host `localhost`, with no
  port. The session row lives in the shared database and the secret comes from the same
  `.env.local`. So one session works on every local port.
- `pilot.mjs` reuses before it mints:
  1. It uses `state-<port>.json` if `GET /api/auth/get-session` still returns `e2e-pilot`.
  2. Otherwise it adopts any working `state-*.json` in the kit, or a file passed with
     `--adopt <storageState.json>`. Adopting does not reset anything.
  3. Only if neither works does it mint once, through `POST /api/dev/synthetic-pilot`.
- **Minting resets the pilot.** It revokes every pilot session, including any on :3000, and
  recreates the pilot's user, character and account rows. So the kit mints at most once and
  then writes the new session to every `state-*.json`.
- The kit servers refuse to mint (500, "The synthetic pilot cannot be the configured
  superadmin"). That guard comes from `SUPERADMIN_CHARACTER_ID=9000001`. So `pilot.mjs` tries the
  target origin first, then falls back to `--mint-origin`, which defaults to
  http://localhost:3000. `--check` never mints; `--force-mint` always mints.
- Sessions last 7 days. The current one came from the previous run's `p8/auth.json` and was
  adopted without a reset.
- Auth modes in a shot: `signed-out` (the default), `pilot`, and `admin`. `admin` is the same
  session as `pilot`, but it fails the shot if the server does not treat it as admin.

## Shot list format

A list is either a bare array of shots or an object with these fields:

```jsonc
{
  "out": "../shots",                       // relative to the list file (--out DIR, relative to cwd, overrides it)
  "sides": { "before": "http://localhost:3101", "after": "http://localhost:3102" },  // the default
  "setup": ["shell", "..."],               // run once before all shots, from the list's directory
  "teardown": ["shell", "..."],            // run once at the end, even after a failure
  "defaults": { /* any shot field */ },    // merged into every shot (shallow merge)
  "shots": [ /* shots */ ]
}
```

Fields of a shot:

| Field | Meaning |
| --- | --- |
| `name` | Output file stem: `<name>-before.png` and `<name>-after.png`. |
| `path` | URL path and query, e.g. `/?demo=one` or `/admin/users/e2e-pilot`. |
| `auth` | `signed-out`, `pilot` or `admin`. |
| `viewport` / `deviceScaleFactor` | Default `{1440x900}` at scale 1. |
| `device` | A Playwright device name instead, e.g. `"Pixel 7"`. Brings touch, DPR and user agent. |
| `colorScheme`, `reducedMotion`, `locale`, `timezoneId`, `userAgent` | Passed to the browser context. |
| `kind` | `png` (the default) or `head`. `head` fetches the raw HTML and writes `<name>-<side>.txt`, listing the `<title>`, `<meta>`, canonical/icon `<link>` and JSON-LD tags, each marked `[head]` or `[body]`. |
| `waitFor` | A selector, or a list of them, that must appear after load. |
| `steps` | A JS async function body, or a list of actions (see below). |
| `region` | What to capture (see below). Omit it, or use `"viewport"`, for the viewport. `"fullPage"` captures the whole page. |
| `images` | EVE's image CDN is outside the sandbox. `blank` (the default) answers every request to images.evetech.net with a flat grey pixel on both sides. `block` aborts those requests. `allow` lets them through. |
| `block` | URL globs (or `/regex/`) to abort. |
| `stubs` | Playwright route stubs (see Mocking). |
| `setup` / `teardown` | Shell commands run around this shot, for both sides. Teardown always runs. |
| `settleMs` | Extra wait before the screenshot. |
| `animations` | Screenshot animation mode, default `disabled`, which fast-forwards finite CSS transitions. The caret is always hidden. |
| `hideDevOverlay` | Hides the Next dev badge and toasts. Default true. |
| `mouseAway` | Moves the mouse to (1,1) before the steps. Default true, except with `device`. |

**Steps as JS.** The body receives `ctx`. These names are already in scope: `page`, `context`,
`base`, `side`, `shot`, `sleep`, `note` and `settle`. Anything you put on `note` lands in
`capture-notes.json`.

```json
"steps": "await page.getByRole('button', { name: 'Add character' }).focus(); note.focus = await ctx.activeElement();"
```

**Steps as actions.** Each action is an object with one verb. `times` repeats it.

- `goto`, `click`, `dblclick`, `hover`, `focus`, `tap`
- `press` (a key, e.g. `Tab`), `type` (text), `fill` (`[selector, text]`), `select` (`[selector, value]`), `check`
- `wait` (ms), `waitFor` (selector), `waitForText`
- `scroll` (scrolls a selector into the centre), `mouse` (`[x, y]`), `mouseAway`
- `settle`, `reload`, `eval` (a page expression; its result goes to `note.eval`)

```json
"steps": [{ "click": "h3:text-is(\"TrendChart\")" }, { "mouseAway": true }, { "press": "Tab" }, { "press": "ArrowLeft", "times": 3 }]
```

**Regions.** The capture is the region's box plus `pad` px on every side (default 16).

- A selector string, such as `[data-admin-card="linked-characters"]`. Playwright selectors work
  too, e.g. `:has()`, `text=` and `h3:text-is("…")`. The first match is used.
- An object with:
  - `selector`
  - `hasText`, to filter the matches
  - `nth`, to pick a match other than the first
  - `ancestor`, an XPath step such as `section` or `div[contains(@class,'px-2')]`. The kit takes `ancestor::<it>[1]`.
  - `xpath`, any relative XPath, e.g. `ancestor::header[1]/..`
  - `pad`
  - `fullPage`
- `{ "union": [part, part, ...] }` takes one box around several elements. For example, a card's
  header plus its chart, without the long table under it. `p318.json` does this.

The kit centres the region in the viewport before the screenshot, so the sticky header does not
cover it. A region taller than the viewport comes from a full-page capture clipped to its
position.

## Mocking data to show a change

Every mock must be **local** and **reversible**. Prefer a shot-level or list-level
`setup`/`teardown` pair: teardown runs even when a shot fails.

### 1. SQL against the local database (`db.sh`)

Use SQL for state the server reads from Postgres: account flags, a user's role, rows a page
lists, and so on.

```bash
./db.sh snapshot account id "user_id = 'e2e-pilot'" mocks/x-before.csv   # save the rows first
./db.sh -f mocks/x.sql                                                   # apply the mock
./db.sh -c "select ... from account where user_id = 'e2e-pilot'"        # check it
./db.sh restore account id mocks/x-before.csv                            # put every column back
```

- `restore` updates the saved rows in place, matched on the key column. It never deletes or
  inserts, so nothing cascades. Rows your mock inserted are yours to delete in teardown.
- Take the snapshot only if the file does not exist yet:
  `[ -f snap.csv ] || ./db.sh snapshot ...`. Then a rerun after a crash cannot snapshot the
  mocked state.
- The database is shared with :3000. Restore promptly.
- Mock only rows that belong to the pilot (`e2e-pilot`, character 9000001) or rows you created.
- Values the pages derive from time, such as "delayed" and "overdue", need timestamps relative
  to `now() at time zone 'utc'`. The columns are `timestamp without time zone`, in UTC.
- Example: `lists/p012.json` with `mocks/p012-delayed.sql`. It sets a placeholder refresh
  token, every `EVE_SCOPES` entry, and an authorization failure that began two days ago, so
  the pilot's character reads "Verification delayed". It also pushes the next check out 7 days.
  The placeholder never decrypts, so it cannot be sent to EVE.

### 2. Playwright route stubs (`stubs` on a shot)

Use stubs for data the browser fetches, such as `/api/...` calls from client components. They
cannot reach data that server components render, such as the home page's `?demo` board, which is
built in `page.tsx`.

```jsonc
"stubs": [
  { "url": "**/api/account/board**", "hold": true },                  // never answer: loading state
  { "url": "**/api/industry/systems**", "status": 500, "times": 1 },   // fail once, then pass through
  { "url": "**/api/x", "method": "POST", "json": { "results": [] } },  // canned JSON
  { "url": "**/api/y", "file": "../mocks/y.json" },                    // body from a file
  { "url": "/\\/api\\/z(\\?|$)/", "transform": "json.items[0].security = null; return json;" },  // edit the real response
  { "url": "**/api/slow", "delayMs": 3000, "json": {} },
  { "url": "**/api/gone", "abort": true }
]
```

`url` is a Playwright glob, or a `/regex/flags` string. `transform` is a function body that
receives `json` and `request`; it is applied to the real response. `capture-notes.json` records
how many requests each stub caught.

### 3. A temporary code edit, in the kit worktrees only

Use a code edit for demo fixtures or server-rendered data. Make the edit in a worktree, turn it
into a patch, then apply the patch to both worktrees for the shot:

```bash
# edit $KIT/wt-new/src/... then:
git -C $KIT/wt-new diff > $KIT/mocks/x.patch && git -C $KIT/wt-new checkout -- .
```

```json
"setup": ["../worktree-patch.sh apply ../mocks/x.patch"],
"teardown": ["../worktree-patch.sh revert"]
```

- `apply` reverts both worktrees first, so patches never stack. It then applies the same patch
  to `wt-old` and `wt-new`, or to neither if either side rejects it. `next dev` hot-reloads the
  change on the next request.
- `revert` runs `git checkout -- .` and `git clean -fd` in both worktrees.
- **Never edit `/home/user/lgi-tools` itself.**
- Example: `lists/p318.json`. It uses `mocks/p318-zero-isk.patch`, which gives the demo pilot
  0 ISK on every day, so the worth chart's ISK band is all zero. It also uses
  `mocks/p318-zero-balance.patch`, which adds no asset rows, so net worth stays pending and
  the Wallet card shows the "Wallet balance over time" trend instead.

## Known limits

- **Convex auth fails for signed-in pages on :3101 and :3102.** Each server's
  `AUTH_ISSUER_URL` is its own origin, but the local Convex accepts only
  `issuer=http://localhost:3000`. The console logs "No auth provider found…", and live features
  that need Convex auth (maps, location) stay empty on both sides. Pages that read Postgres on
  the server are unaffected.
- The database is shared, so page views, custom structures and similar data pile up between runs
  and show on both sides. Shots that show counts can differ for that reason alone.
- First load after a start or a patch compiles in dev, which takes 10–20 s. Shots use long
  timeouts.
- The "Reset and continue as E2E Pilot" link in the dev header calls the mint route. Never
  click it in a step: it would reset the pilot.
