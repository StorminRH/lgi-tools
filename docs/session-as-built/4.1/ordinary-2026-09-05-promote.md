# Ordinary Work As-Built — Atlas location reconnect and leftover cleanup

**Record status:** Final
**Recorded:** 2026-09-05
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#125`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Atlas tracking now says when a character cannot sync location. The portrait rings orange and Reconnect signs that character back in, then returns you to the same map. Missing location scopes no longer look like the character is just offline.

- Added: Tracking shows Reconnect when location scopes are missing, and that sign-in lands back on the same map.
- Changed: Search recents update through one hook. Leaving lightbox mode closes the sites card.
- Fixed: A character who cannot sync location no longer looks the same as offline on Atlas.

## Divergences from plan

None.

## Final surfaces

- `src/platform/auth/panel-character.ts` — `toAccountCharacter` splits skill-queue reconnect from location reconnect
- `src/mapper/tracking/TrackingControls.tsx` — orange reconnect ring and injected Reconnect action
- `src/app/(site)/atlas/MapTrackingMenu.tsx` — Reconnect returns to the current map
- `src/features/maps/map-navigation.ts` — `atlasSignInReturnHref` takes the raw map param
- `src/data/maps/queries.ts` — `affectedMapIdsForCharacter` is the only affected-map union
- `src/composition/pipelines/cron-gate.ts` — cron declarations no longer carry an idle probe

## Discovered work

None.

## Successor notes

- Session 4.1.1.1 Ordered work step 7 is still open on development. Its as-built waits for a later close-out.
- 4.1.2.1 has not started.
- Dump is GitHub #476.
- CodeRabbit skipped the dump because the base is `staging`, then posted a triggered notice with no findings. Greptile posted 4/5 with a Node-types note that this close-out rejected. Bugbot posted a summary only.

## Verification summary

- **Adversarial review:** Subject: Origin `125`; `origin pr diff 125`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko, Bugbot, Greptile, CodeRabbit; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: duplicate map-id helper, lightbox unmount, cron idle probe, and recents single-read accepted and landed. Two reconnect models, validator export, tracking-controls-view extract, Greptile `@types/node` 26, and CodeRabbit skip rejected or out of scope.
