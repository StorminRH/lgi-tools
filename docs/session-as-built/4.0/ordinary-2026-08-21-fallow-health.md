# Ordinary Work As-Built — Fallow production graph and 3.16 pin

**Record status:** Final
**Recorded:** 2026-08-21
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/fallow-health-agent-gate-5b18`
**PR:** `#15`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `.fallowrc.json` — type-aware private-type leaks, leftover warning rules as errors, empty `entry`, `dev-dependencies-in-production` on, `tailwindcss` ignored as a CSS compiler
- `package.json` — Fallow 3.16.0, `dead-code --production` on verify, `fallow:health:local` for cyclomatic and cognitive only
- `src/composition/sync/owned-assets-source-save.ts` — corporation owned-assets snapshot write, extracted so the production graph has a named site
- `src/mapper/chain/intents.ts` — `MapChainIntent` is the only public name. Variants stay inline
- Test-only modules under `__tests__` trees so production dead-code stays closed

## Discovered work

None.

## Successor notes

- GitHub dump skipped. Operator waived it for the 173-file app-facing count, mostly one-line exports and test-tree moves.
- `scripts/apply-neon-config.ts` still imports the Neon CLI default export and rejects null. LGI-42 forbids `ignoreExports`. That import is what keeps the default export on the full graph after `entry` went empty.
- `saveOwnedAssetsFromSource` still compensates a non-atomic snapshot insert and projection write. Comment-sicko killed the sermon. A shared transaction was left open. It is existing policy, not this sitting.
- `LOCATION_SYNC_SCOPES` lost its file banner. The live token-vend reauth path still owns the real gate. Do not grow a second production helper to replace the pin.
- `fallow dead-code --production` warns that zone `esi-datasets` matched 0 reachable files. Those modules now live under test trees. Exit is still 0.
- Origin #14 remains open against `development`. This record is the staging promote on #15.
- This Cloud Agent Origin token cannot open review threads. Depot version 2 failed `walks the whole mapper zone` because the walker still treated `layout/__tests__/determinism-fixture.ts` as the mapper zone. Diagnose blamed a warm-neon timeout. The verify log is the assertion. The walker now skips `__tests__`. The disposition lives here and in chat.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `6b96b0240028200b99ff95c88520072b3c300cc6`..`origin/stormin/fallow-health-agent-gate-5b18` `66fe26e45fc23bde101890417797f83e3af93af1`, then joined at `75a91742` and corrected on `6318498e` and `863e6c85`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: stale `sync/insert-esi-snapshot` owner and leftover vendor-registry lint path accepted and fixed. Neon default-export null check rejected. LGI-42 forbids `ignoreExports`. Snapshot compensation reshape and location-scope pin reshape rejected as existing policy outside this packet. Comment-sicko deleted 39 comments and the two `@ts-expect-error` window shims. Those shims now use `defineProperty`.
