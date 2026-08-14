---
date: 2026-08-13
source: fix/atlas-audit-jump-delete-bugs
---

#### Fixed
- Stopped the Atlas audit log chip from pulsing while undoable events remain.
- Scoped the "which signature did you jump through?" prompt to the tracked character that jumped, so other editors on the map no longer see it.
- Restored expired unresolved wormholes can be deleted again from the Signature Editor.
