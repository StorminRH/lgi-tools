# sheet-audit — Phase 2.6 working folder

This directory is the analyst workspace for the one-time deep
audit of the upstream wormhole-sites Google Sheet performed during
Phase 2.6. Nothing here is loaded by the app at runtime.

## What's here

- `fetch-tabs.ts` — one-shot script that hits the Sheet's
  `pubhtml` URL, enumerates every published tab (name + gid), and
  downloads each tab as CSV into `raw/`. Also writes a JSON
  manifest at `manifest.json`.
- `raw/` — per-tab CSV dumps named `<gid>-<slug>.csv`.
- `manifest.json` — `{ tabs: [{ gid, label, path }] }`, written by
  `fetch-tabs.ts`.
- `tabs-summary.md` — for each tab: *what's here / what we'd want
  / what we'd skip*. Hand-authored after reading the CSVs.
- `calculations-report.md` — reverse-engineering report on how the
  Sheet derives per-NPC DPS / EWAR / EHP. Identifies the raw
  inputs and whether SDE has the equivalent attributes, so a
  future phase can compute these natively instead of trusting
  pre-baked Sheet values.
- `seed-source/` — cleaned JSON the historical-seed migration
  consumes. Produced by `extract-seed.ts` (added in Step 2b).

## How to re-run

```bash
SHEET_PUB_KEY="$(grep '^SHEET_PUB_KEY=' ../.env.local | cut -d= -f2)" \
  pnpm tsx sheet-audit/fetch-tabs.ts
```

Re-running overwrites `raw/` and `manifest.json`.

## Why this exists outside `src/`

Per CLAUDE.md, `src/features/` and `src/data/` are application
code. This folder is throwaway/research code — it ships in the
repo so future sessions can reproduce the audit if the Sheet
changes, but it is never imported by the app.
