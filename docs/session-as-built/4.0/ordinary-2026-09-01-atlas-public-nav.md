# Ordinary Work As-Built — Public Atlas nav and agent pins

**Record status:** Final
**Recorded:** 2026-09-01
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#58`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Atlas sits in the public header next to Wormhole Sites and Industry Planner, and the home Tools grid has a card for it. Opening `/atlas` no longer asks whether you are an administrator. Signed-out visitors stay on the catalogue, including a shared `?map=` URL, so Log in with EVE Online stays reachable. The canvas opens only when a signed-in viewer has a map selected.

- Added: Atlas on the public header and home Tools grid
- Changed: signed-out `/atlas` shows the catalogue instead of the administrator wall
- Fixed: a shared `/atlas?map=` link no longer covers login for signed-out visitors

## Divergences from plan

None.

## Final surfaces

- `src/app/(site)/atlas/AtlasBound.tsx` — session gate, catalogue for guests, canvas for a signed-in selected map
- `src/data/tools/registry.ts` — Atlas in the public header strip
- `src/components/composition/HomeFeatureCards.tsx` — Atlas home card
- `src/app/(site)/atlas/page.tsx` — public Atlas metadata through `buildPageMetadata`

## Discovered work

None.

## Successor notes

- Signed-out catalogue still shows Create and Trash. Mutations fail at the map access routes. A guest landing that names login, or an `AtlasViewer` kind on `MapCatalogueData`, is later work.
- Comment-sicko MUST KILL flags on `showCanvas`, `listingAvailable: gate !== null`, and the `checkSession` catch stay open. This close-out does not rename those.
- Dump is GitHub #467.

## Verification summary

- **Adversarial review:** Subject: Origin `58`; `origin pr diff 58`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: signed-out Create/Trash, incomplete-session canvas, listing-fail canvas gate, test `!` comment, comment-sicko deletions and reshape flags, and `atlas-wall.mjs` rename rejected.
