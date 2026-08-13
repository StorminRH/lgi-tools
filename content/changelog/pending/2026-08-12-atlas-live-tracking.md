---
date: 2026-08-12
source: ordinary mapper live-tracking fixes
---

#### Changed
- The current-system dock and scanner follow a tracked character in space. When nobody is covered they fall back to the chain root, and selecting the root while the dock is elsewhere still opens the usual system card.

#### Fixed
- Creating a map can track an in-space alt when the session character is offline, and uses that location as the starting system.
- A watched jump no longer drops the character off the map when the previous location sample is a few seconds older than the old continuity window.
- A linked wormhole now appears on both scanners. Opening the far-side row keeps the editor leader on that signature.
