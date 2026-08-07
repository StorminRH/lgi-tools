---
date: 2026-08-07
source: atlas-hidden-tab-tracking
---

#### Added
- Atlas location tracking now survives alt-tabbing into the game: with the map tab open behind the EVE client, jumps keep landing on the map and new connections keep drawing, while closing the tab still winds tracking down within a few minutes.
- An AFK check guards the always-on tracking: after an hour with the map continuously out of sight a prompt asks whether you are still mapping, and tracking pauses a few minutes later unless you continue. The prompt waits for your return, and dismissing it resumes tracking instantly.

#### Changed
- While every tracked pilot is logged out of EVE, the tracker drops to a once-a-minute login check instead of the five-second location loop and speeds back up on the next login automatically.
- Tracked-location sync now also reads the in-game online flag, so characters linked under an older consent may need a reconnect before tracking resumes.

#### Removed
- The green online dot on character portraits. It was the last thing keeping live sync running on every page; with it gone, only the Atlas map talks to the live backend, and in-game presence now lives inside the map tracker itself.
