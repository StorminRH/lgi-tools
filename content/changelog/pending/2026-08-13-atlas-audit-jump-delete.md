---
date: 2026-08-14
source: stormin/combine-atlas-neon-audit
---

#### Changed
- Live Convex traffic no longer wakes Neon on every tick: location sync holds a short-lived EVE access-token lease, and the website JWT is minted once per session.
- Empty complete Atlas scanner views stay blank instead of showing a no-rows placeholder.
- Atlas connection lines only catch the pointer when Edit or Delete can run.

#### Fixed
- Stopped the Atlas audit log chip from pulsing while undoable events remain.
- Scoped the "which signature did you jump through?" prompt to the tracked character that jumped, so other editors on the map no longer see it.
- Restored expired unresolved wormholes can be deleted again from the Signature Editor.
- Owner-hash character transfers now tear down the prior owner's live location tracking.
- Location sync drops a held EVE access-token lease after ESI 401 or 403, so the next run re-vends instead of replaying a dead token.
