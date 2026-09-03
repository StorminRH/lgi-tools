# Ordinary Work As-Built — Daily test cleanup

**Record status:** Final
**Recorded:** 2026-08-21
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/test-cleanup-closeout-ee1b`
**PR:** `#18`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `src/platform/auth/convex-jwt-payload.test.ts` — 7-day JWT, cached JWKS, display name, role, no Neon enrichment, no token material
- `convex/characterLocationSync.test.ts` — ESI 403 keeps the last-known doc, clears a fresh vend, and drops a held lease without vending
- `src/mapper/signatures/connection-authoring-api.test.ts` — stub delete and refused-remove toast stay on `connectionLifecycleActions({ stub }).remove()`

## Discovered work

None.

## Successor notes

- Origin #7 on `stormin/daily-test-cleanup-50f6` is the retired pre-rebase host.
- Dump GitHub #455. CodeRabbit asked to drop `!` on `fetchMock.mock.calls[0]` and `emptyClass[0]`, and to mock `ConvexReactClient` instead of the `initialAuthTokenReuse` source pin. Left unfixed. Status 204 already proves the fetch, `emptyClass` is a local fixture, and the source pin matches the JWT suite. Greptile did not reply. GitHub Actions `test` on the dump is red and unused. Origin Depot is the land gate.
- Comment-sicko reshape flags on `seedOnline`, `coveredCharacterIds`, `stubDispatch`, `heartbeat`, `scan`, `onSyncComplete`, `sweep`, `purgeUserClaims`, `applyEliminationDeductions`, `apply`, `removeSignatures`, `chain`, `EXCLUSIONS`, `pendingDoorbells`, `ringPendingTransitions`, and `declaredNode` stay open. This close-out does not rename those helpers.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `8e4d4a476ffb642cc3008ab93fb76242be8fdb5a`..`stormin/test-cleanup-closeout-ee1b` `ea5ffbac5c84a77ea4035333b355eeececdf6316`, then corrected on `e8d250829cc4a21684931866b6e18c10dced59b5`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: fresh-vend ESI 403 lease-clear and client spy `afterEach` accepted and fixed. Mega-tests and census total-count pins rejected as the authorized cleanup. Comment-sicko deletions accepted except Next prerender, React Strict Mode, Drizzle thenable, and better-auth keeps.
