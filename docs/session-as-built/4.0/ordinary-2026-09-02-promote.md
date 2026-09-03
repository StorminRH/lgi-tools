# Ordinary Work As-Built — Hobby crons, maps purge constructor, and agent pins

**Record status:** Final
**Recorded:** 2026-09-02
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#63`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Staging no longer schedules the 15-minute ESI drain or the sync watchdog. Those routes stay as CRON_SECRET GET. Maps user purge takes its projection hooks at construction instead of a late module register. Agent and skill defaults pin GLM 5.2 and Grok 4.6.

- Changed: the 15-minute ESI drain and sync watchdog no longer run on a Vercel schedule

## Divergences from plan

None.

## Final surfaces

- `src/data/maps/purge.ts` — `createMapsPurgeContributor` with injected projection hooks
- `src/composition/purge/register-all.ts` — constructs the maps contributor
- `vercel.json` — remaining daily and weekly crons
- `src/app/api/cron/drain-esi-refresh-jobs/route.ts` — unscheduled CRON_SECRET drain
- `src/app/api/cron/sync-sweeper/route.ts` — unscheduled CRON_SECRET watchdog

## Discovered work

None.

## Successor notes

- Comment-sicko MUST KILL flags on `isDailyHealWindow` and `readSweepCounts` stay open. This close-out does not rename those.
- `registerIdentityProjectionHooks` is still a module-level register. The purge factory does not apply there.
- `purgeCharacter`'s affected-map walk still duplicates `mapIdsAffectedByCharacter`. Extract only when a second in-layer consumer exists.
- Dump is GitHub #468. Bugbot did not post on Origin #63.

## Verification summary

- **Adversarial review:** Subject: Origin `63`; `origin pr diff 63`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: comment-sicko narration deletions accepted and fixed. MUST KILL reshape flags, identity-hook singleton, affected-map helper, purge-before-delete why-comment, Greptile 15-minute schedule restore, CodeRabbit JSDoc, and CodeRabbit hourly wording rejected.
