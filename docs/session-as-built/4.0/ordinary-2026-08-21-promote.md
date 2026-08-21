# Ordinary Work As-Built — Purge fence, stale restore, and preview off

**Record status:** Final
**Recorded:** 2026-08-21
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#13`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

A finished purge now writes an empty live-access fence before the durable tombstone. If that fence loses, the map stays eligible for another sweep instead of looking gone. Restore that loses the projection race reports pending, not done. Pushes to development no longer open a preview.

- Fixed: a delayed access write cannot revive a map after purge
- Fixed: restore reports pending when a newer empty projection already won
- Changed: development pushes do not open a preview

## Divergences from plan

None.

## Final surfaces

- `src/composition/map-purge.ts` — empty-claim fence must win before tombstone
- `src/composition/map-lifecycle.ts` — restore treats a stale projection as pending
- `src/lib/convex-http-door.ts` — shared timeout and abort for Convex HTTP posts
- `vercel.json` — development auto-preview disabled

## Discovered work

None.

## Successor notes

- Dump CodeRabbit on GitHub PR 453 asked for JSDoc on the Convex door, user-purge, and map-purge exports. Left unfixed. The no-comments rule wins.
- Greptile did not reply on dump PR 453. CodeRabbit did.
- This Cloud Agent Origin token cannot open review threads or comments. The dump disposition lives here and in chat.
- Origin #11 squash-merged onto staging as `f49f5021`, which conflicted with this head. Staging was joined into development and the six conflicted files kept the development lines.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `f49f5021d63b154c32f09187059569b73e82f571`..`origin/development` `7c49e514c7a1bc81c3f5e0b49030dc046dfc07f8`, then corrected on `adf2dd4e59c18b200f78267320abcb770b851871` and joined at `8ae82a2eb355fc1e2590d067ef1d7e4517f9a9e3`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=`gpt-5.6-sol-medium` for structure and behavior, thermo seats returned reports, `comment-sicko` returned a report with 6 deletions; Verdict: `PASS`; Disposition: purge fence before tombstone, stale restore as pending, and shared Convex door accepted and fixed. Identity durable-retry rejected as out of packet and existing best-effort policy. Rolling-deploy revision 400 rejected because staging already requires and sends a revision. Fallow registry unwind rejected as authorized extraction. CodeRabbit JSDoc left unfixed under no-comments.
