# Ordinary Work As-Built — Atlas requests, jump recovery, and maintenance

**Record status:** Final
**Recorded:** 2026-09-07
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#147`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Atlas avoids repeating signature analysis and wormhole type requests after successful reconciliation. Failed requests remain retryable. Jump tracking shares recent work across tabs and survives abandoned requests. Location sync skips empty preparation and saves refreshed token leases in batches.

- Changed: Repeating an unchanged signature paste or wormhole type selection skips work that already succeeded.
- Changed: Character tracking does less database work when there is nothing to sync.
- Fixed: Failed signature and wormhole type follow-ups retry on the next identical input.
- Fixed: Newly opened Atlas tabs share recent jump results, and abandoned jump requests become retryable.
- Fixed: An older character sync cannot overwrite or clear a newer run's token lease.
- Changed: Updated Next.js and its image-processing dependency.
- Removed: Unused character field usage in the application and redundant test assertions.

## Divergences from plan

None.

## Final surfaces

- `src/mapper/signatures/signature-elimination-client.ts` tracks successful reconciliation and invalidates stale attempts.
- `src/mapper/signatures/type-setter-follow-up.ts` tracks unfinished elimination and typed-hole follow-ups separately.
- `src/mapper/tracking/doorbell-model.ts` shares jump request leases and results across tabs and remounts.
- `convex/characterLocationSync.ts` skips empty preparation and batches access-lease writes while preserving separate query budgets.
- `convex/mapAccessProjection.ts` preserves legacy owner authorization and provides a paginated role remapper.
- `src/db/auth-schema.ts` drops the unused character fields from the application model while the physical columns remain for rollout compatibility.

## Discovered work

- Dropped physical character-column contraction from this promotion because the serving deployment and supported rollback targets still reference those columns. The migration chain remains identical to staging. A future cleanup can remove them after those targets no longer need them.

## Successor notes

This record covers ordinary work in Origin changes #139 through #146 and closes no numbered lifecycle session. The earlier ambiguous-jump delivery record covers behavior already present in the promotion base.

Stored Convex owner claims still authorize as admin; new writes reject owner. After this compatible version is deployed, the internal remapper can process each hosted deployment in pages until complete. Schema contraction belongs to a later change after confirming no legacy owner claims remain. This promotion does not claim that hosted remapping ran.

Location preparation keeps held-state and lease reads in separate transactions. Lease batches contain at most 32 entries and add one sync-subject lookup before each entry's tracking and lease lookups. No tracking caps or retention policies changed. Signature elimination loads the codex once per request, including when one system fails.

Browser jump sharing remains best effort. The 15-second recovery lease does not promise exclusive requests across tabs; server transition stamps own topology idempotence.

## Verification summary

- The correction batch committed as `5be9f6b302c87d84b5ced2bae8a51cf196072dd8` passed typecheck, lint, both Fallow dead-code modes, duplication, and local health. Focused regression proof passed 27 files and 289 tests without skips, including disposable local Postgres schemas. An obsolete export pin failed the first integrated run; it was removed before the complete green rerun.
- New regressions cover stale lease puts and clears during real action interleavings, shared codex loading after a first-system deduction error, overlapping idle follow-ups, failure/rejection retries, and protection from older completions.
- `git diff --exit-code origin/staging -- drizzle` passed, confirming this promotion adds no database migration. The corrected functions passed Convex typechecking and function registration on an anonymous local backend at `127.0.0.1:3210`; no hosted deployment was changed by this check.
- **Adversarial review:** Subject: Origin `147`; `origin pr diff 147`; Roles: structure-reviewer, behavior-reviewer, thermo-nuclear-review-subagent, thermo-nuclear-code-quality-review-subagent; Runtime identity: requested=repository agent-file pins, observed=Not observable; Verdict: PASS; Disposition: Destructive migration removed, lease generation fencing added, dead single-lease endpoint removed, role normalization consolidated, and request-scoped codex ownership corrected. The behavior reviewer retracted the preexisting simultaneous-tab duplicate-request finding after checking authority and server idempotence.
- Bugbot completed the frozen review without findings. Its later schema-drift finding was rejected: the migration history remains byte-identical to staging, generation is a separate manual command, and physical contraction must wait for compatible rollback targets. GitHub mirror #484 completed one requested Greptile and CodeRabbit pass. The stale-lease finding was fixed with the thermo finding; idle coalescing and both test corrections were accepted. Mandatory export comments were rejected under the current repository policy. A longer doorbell lease was rejected because it delays the existing recovery contract without guaranteeing distributed exclusivity. Origin version 2 records all dispositions.
- The additional repository-wide `lifecycle check-evidence --check` reported an existing policy-wording error in unchanged `docs/workflows/schema/session-as-built.md`. This record was checked against the canonical ordinary-work frame; all required local suite commands passed.
- Depot is the final pipeline gate after this record lands. No fresh authenticated UI walkthrough or operator visual acceptance is claimed.
