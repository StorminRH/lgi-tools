# SCRATCHPAD — LGI.tools

> Working memory across sessions. Update at the end of every session.

---

## Session 1 — Project Skeleton (2026-05-22)

Stood up Next.js 16.2.6 + App Router + TS + Tailwind v4 with **pnpm**.
Drizzle ORM + postgres-js. Docker Postgres on **host port 5433** (5432
already held by another EVE project, `wormhole_db`). Two-env split:
local Docker, prod Neon (provisioned via Vercel Storage marketplace as
`LGI-Tools-DB`). GitHub: [StorminRH/lgi-tools](https://github.com/StorminRH/lgi-tools);
Vercel project `lgi-tools` under `stormins-projects` auto-deploys
`main` to `lgi.tools`. Folder is `LGI Tools/` (space tolerated by all
tooling); package name `lgi-tools`.

Scripts: `dev`, `build`, `db:generate`, `db:migrate`, `db:studio`,
`db:push`.

## Session 2 — Wormhole Sites Schema (2026-05-22)

First feature schema at `src/features/wormhole-sites/schema.ts`,
re-exported from `src/db/schema.ts` — that's the pattern for adding
features. Enums driven from TS `as const` arrays (`SITE_TYPES`,
`WORMHOLE_CLASSES`) so Postgres types and TS types share one source of
truth. `wormhole_class` values are uppercase `C1…C6` to match EVE
convention. Migrations are idempotent (re-running is a no-op).

## Session 3 — Sheet Ingestion (2026-05-22)

CSV ingest from the published Google Sheet (no API key, `pub?gid=…`
endpoint, `SHEET_PUB_KEY` in `.env.local`). Schema extended with
`waves`, `npcs`, `site_resources` and additional `sites` columns.
Key choices that still matter:

- **Trigger labels & sleeper class codes are free text** (not enums) —
  the Sheet has a long tail of one-off labels, locking would force a
  migration per typo. `TRIGGER_LABELS` and `SLEEPER_CLASS_CODES` `as
  const` arrays give compile-time autocomplete without DB rigidity.
- **`wormhole_class` is nullable** — gas/ore tabs cover all classes in
  one sheet and don't tag each site with a class.
- **Replace-children on upsert** (`DELETE waves WHERE site_id=?` then
  re-insert) — simpler than diff, converges to Sheet state.
- **Prune scoped to fetched tabs** — partial outage can't wipe
  unrelated rows.

Output after ingest: 69 sites · 183 waves · 509 NPCs · 219 resources
(combat 24, relic 12, data 12, ore 12, gas 9). Round-trips verified on
local + Neon. Scripts: `db:ingest`, `db:ingest:prod`, `db:migrate:prod`
(the `:prod` variants set `DOTENV_PATH=.env.production.local`).

## Session 4 — API Endpoints (2026-05-22)

`GET /api/sites` (with `?type=` and `?class=` filters) and
`GET /api/sites/[id]`. Strict response types in
`src/features/wormhole-sites/types.ts` — re-exports `SiteType` /
`WormholeClass` from schema (one source of truth). Three notable
decisions:

- **Lazy db client (Proxy)** in `src/db/index.ts` — connection deferred
  to first query, not module load. `.env.production.local` from
  `vercel env pull` writes `DATABASE_URL=""` placeholders that would
  otherwise crash `next build`. Vercel injects the real URL at
  runtime.
- **Validation in route handler, not query function** — queries accept
  already-typed values, handlers guard the boundary.
- **FK columns excluded from responses** — explicit column selection in
  `queries.ts` means `waveId` / `siteId` never appear in JSON.

API surface stable; production at `lgi.tools` matches local.

## Session 5 — Deferred

Original plan was to build server-rendered `/sites` + `/sites/[id]`
pages, but the user had a finished HTML prototype to wire up first.
Pushed page work to Session 7 (after the design system lands).

---

## Session 6 — Card Components & A1 Theme (2026-05-22)

### What was built

| File / Dir | What it is |
|---|---|
| `src/app/globals.css` | Rewritten with `@theme` A1 tokens (surface, text, isk, dps-tier colors) and a CSS rule rotating `[data-chevron]` inside open `<details>` |
| `src/app/layout.tsx` | Swapped Geist → **IBM Plex Mono** + **Barlow Condensed** via `next/font/google` (CSS vars `--font-plex-mono`, `--font-barlow`); metadata set to "LGI.tools" |
| `src/components/ui/*.tsx` | Domain-agnostic primitives: `Card`/`CardHeader`, `Pill`, `Chip`, `Collapsible`+`Chevron`, `MetricBlock`, `SectionHeader`, `SectionFooter`, `Callout`, `EmptyState`, `Dot`, `EntityRow`/`ResourceRow`/`Stat`/`LabeledChipRow`, `cn` helper |
| `src/features/wormhole-sites/components/wormhole-styles.ts` | The **only** file in the codebase that knows "C5 is red" / "WEB is blue" — central mappings: `CLASS_TONE`, `SITE_TYPE_TONE`, `EWAR_TONE`, `TRIGGER_CHIP_TONE`, `DPS_TIER_CLASS`, `dpsTier()` thresholds, scan/anomaly mapping |
| `src/features/wormhole-sites/components/{SiteCard,EwarRow,WaveCard,NpcRow,ResourceRow}.tsx` | Composition layer — assembles primitives with wormhole semantics, consumes `SiteDetail` shape directly |
| `src/features/wormhole-sites/mock-data.ts` | 11 `SiteDetail` fixtures mirroring `card_reference.html` (combat C1/C3/C5, ore C2/C3, gas C2/C4, relic C1/C3, data C1/C4) |
| `src/app/preview/cards/page.tsx` | Server component grouping mock fixtures by site type into the prototype's grid layout |
| `.claude/launch.json` | Adds `next-dev` config for the Preview MCP tool |

### Decisions made

- **`Collapsible` is a pure `<details>`/`<summary>`** — no `'use client'`.
  First attempt used a `useState` client component with a `header:
  (open) => ReactNode` render prop; that crashes RSC because functions
  can't cross the server/client boundary. Native `<details>` toggles
  in-browser, the chevron rotates via a single CSS rule scoped to
  `details[data-collapsible][open] > summary [data-chevron]`. Side
  benefit: zero JS shipped for the toggle.
- **Two layers, hard separation.** `src/components/ui/` accepts
  abstract `tone` props (`green`, `orange`, `red`, …) and never imports
  from `features/`. `wormhole-styles.ts` is the *only* bridge. Future
  features (`mining-fits`, `pi-planner`, etc.) get their own
  composition folder and reuse every primitive untouched.
- **Tone palettes inlined in each primitive (TS lookup), not in
  `@theme`.** The pill/chip colors use semi-transparent rgba and
  three-shade soft/fg/border combos that don't map cleanly to
  Tailwind's name-per-color model. Arbitrary hex values inside a
  `Record<Tone, string>` are readable and survive `pnpm build`.
  Structural colors (`bg`, `border`, `text`, `name`, `muted`, `isk`)
  *are* in `@theme` so common utilities work.
- **DPS thresholds** (`low <50`, `mid 50–199`, `high ≥200`) live in
  `wormhole-styles.ts::dpsTier()` — one place to retune the visual
  band if balancing changes.
- **Mock data shape = real API shape.** Fixtures conform to the
  existing `SiteDetail` interface from `types.ts`, so Session 7 swaps
  `MOCK_SITES` → `getSiteDetail()` with no component changes.

### Verified

- `pnpm tsc --noEmit` clean.
- `pnpm build` clean — `/preview/cards` prerenders static.
- Visual parity vs `LGI Tool References/card_reference.html` at desktop
  (1280px → 3-column grid) and mobile (375px → single column).
- Pills: scan neutral, combat red-soft, ore yellow, gas teal, relic
  orange-soft, data blue; C1 green, C2 green-strong, C3 orange,
  C4 magenta, C5 red, C6 purple.
- Chips: WEB blue, SCRAM red, NEUT purple, RR green, TRIGGER orange.
- Chevron rotation: closed `transform: none`, open `matrix(-1,0,0,-1,
  0,0)` (180°). Native `<summary>` click toggles details (true→false
  confirmed).
- DPS color tiers render: 24 green, 50/110/280 orange→red gradient,
  1100 red.
- Gas cards show the orange spawn callout; relic/data cards show
  colored dots; "No Sleeper presence" empty-state on hack-only sites;
  "no combat wave" sub-label on combat-free sites.
- Console clean — no errors.

### Open questions / deferred

- **`SignatureLabel` import is unused in `types.ts` re-exports** — not a
  bug, just noise; can drop when convenient.
- **Wave-level vs site-level EWAR** — currently the card-header EWAR
  row sums across all waves. Real combat sites might want per-wave
  EWAR display only. Defer until the real-data session reveals which
  reads better.
- **`triggerLabel` rendering** — every non-null trigger label currently
  shows "TRIGGER". The Sheet has a tail (`Opt`, `DTA`, `1st Death
  Trigger`, `Opt?`) — when a real player asks, decide whether to
  surface them.
- **No filter / sort UI** on the preview route — that's the real
  `/sites` list page job (Session 7).

---

## Session 6.5 — Design Polish (2026-05-22)

Visual iteration pass on the card system. All changes verified in the live
preview before committing. Key decisions that still matter:

- **EWAR chips moved to far-right of NPC rows** — chips column swapped to
  render after the trailing stats column (`EntityRow` render order change).
- **Card header is now collapsible** — entire card body (EWAR, waves,
  resources) wraps in `<details data-collapsible>` with `<CardHeader>` as the
  `<summary>`. Default closed; all waves default open when expanded. No chevron
  — the native `<details>` affordance is sufficient.
- **Resources before wave spawns on non-combat sites** — ore/gas/relic/data
  show deposits/clouds/containers first, wave spawns below.
- **Wave headers styled as section dividers** — match `SectionHeader` exactly:
  `text-[9px] font-semibold tracking-[0.16em] uppercase text-muted` on
  `bg-section` with top + bottom borders. DPS kept at same size with tier color.
  `Collapsible` gained an optional `headerClassName` prop to support this.
- **Uniform text color** — `EntityRow` name changed from `text-text` to
  `text-name` so NPC names match the brightness of ore/resource row names.
- **EWAR row background** changed from `bg-ewar` to `bg-bg` to match the
  card header background seamlessly.
- Generated `LGI Tool References/card_built.html` as a static snapshot (inline
  CSS, dev-server-captured) for offline reference.

---

## Session 7 — Starting Point

**Goal:** wire real data into the new components and stand up the real
pages.

**The swap is one line:** in `src/app/preview/cards/page.tsx`, replace

```ts
import { MOCK_SITES } from '@/features/wormhole-sites/mock-data';
```

with a server-side fetch via the existing helpers in
`src/features/wormhole-sites/queries.ts`:

```ts
import { listSites } from '@/features/wormhole-sites/queries';
// then in the component: const sites = await listSites();
```

(Note: `listSites()` returns `SiteListItem[]`, not `SiteDetail[]`.
Either build a `listSiteDetails()` for the preview, or — better — split
the work as planned:

1. **`/sites`** server component — `listSites()` → grid of compact
   list cards (subset of `SiteCard`, header + ISK + pills only).
   Add `?type=` / `?class=` filter UI.
2. **`/sites/[id]`** server component — `getSiteDetail(id)` → full
   `SiteCard`. The preview page can be deleted once both real routes
   exist (or kept under `/preview/cards` as a design-system regression
   page).

**Boot order for local dev:**

```bash
docker compose up -d   # Postgres on :5433
pnpm db:migrate        # no-op unless new migrations
pnpm db:ingest         # refresh from Sheet (≈1s local)
pnpm dev               # localhost:3000
```

**Quick sanity check:**

```bash
curl http://localhost:3000/api/sites | jq length   # expect 69
```
