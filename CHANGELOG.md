# Changelog

User-facing changes to LGI.tools, grouped by ship date. Internal cleanup,
CI, and infrastructure work is intentionally excluded — see the SCRATCHPAD
for the full forensic record.

### 2026-05-25

- Added a terminal-style search to the wormhole sites browser. Type filters like `c5/relic` or just `ore` to jump straight to a slice of the catalogue. Suggestions populate below the input as you type.
- Added a global footer with the current version, a changelog link, and a feedback affordance.
- Added this changelog page.
- Added EVE SSO sign-in. Click "Log in with EVE" in the header to authenticate via the Fenris Creations (formerly CCP) servers.

### 2026-05-24

- Wormhole site combat numbers (DPS, EHP, EWAR) are now computed live from EVE SDE data instead of from baked snapshots — silent upstream drift is caught immediately.

### 2026-05-23

- Wormhole site resource values now overlay live Jita prices. The refresh button at the bottom of the sites page pulls fresh prices (24h cache).
- Site detail URLs are now shareable — click any site card and the URL updates to `/sites/<id>`.
- Combat and hack sites now show killing-wave ISK as their primary value.
- Added the wormhole sites browser. Browse every wormhole site with filters by class and type; expand any site for waves, NPCs, EWAR, and resource values.
