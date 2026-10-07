# Part 32: Testing strategy

**Status:** Draft for owner review

## In one paragraph

This part says how the encryption work is tested, under the repo's existing rules rather than a new regime. Sealed-service code gets ordinary Vitest tests. Today's Convex test scenarios run again against the ported map logic. Sealed documents get real-Postgres tests. Attestation is tested against recorded AWS documents, and crypto against fixed vectors in Node and three browser engines. The Playwright smoke journeys, plus one map journey landed before any change, keep their assertions and run against the dev sealed service. `pnpm check` and `pnpm verify` stay the gates, with zero Fallow findings, and cover `sealed-service/`. Real KMS, enclaves and timings are checked only on staging. No committed fixture or CI job uses a real KMS key. Formal models, a device lab, a relay simulator and external reviews are dropped.

## How it works today

- **Runners.** Vitest 4.1.11 finds `src/`, `convex/`, `scripts/` and `e2e/` tests, with Istanbul coverage. Playwright 1.62.1 runs `e2e/**/*.spec.ts` in Desktop Chrome only.
- **Flavours.** The lightest test that can fail: co-located unit tests with fakes, real-Postgres `*.db.test.ts` through `createDbTestHarness`, a tiny smoke suite. The principles reject copy pins and lone static absence checks.
- **Convex tests.** 36 of the 41 `convex/**/*.test.ts` files build `convexTest(schema, modules)`. Most arrange and assert through `t.run(ctx => ctx.db…)` on plaintext tables such as `mapSystems`.
- **Smoke.** `e2e/smoke.spec.ts` walks `/`, `/industry`, `/atlas` (landing only, no map opened), `/jobs`, `/structures` and `/settings/characters` signed in. It fails on page errors and on console errors outside `CONSOLE_ALLOW`, which excuses `127.0.0.1:3210`, `ERR_CONNECTION_REFUSED` and `va.vercel-scripts`. `e2e/home-board.spec.ts` stubs `/api/account/board` and attaches no diagnostics. Auth is a seeded cookie for the synthetic pilot; the mint route works only with `NODE_ENV=development` on localhost.
- **Gates.** `pnpm check`: typecheck, lint, changed tests, static Fallow. `pnpm verify` adds the full suite under coverage, dead code and CRAP; Coverage health runs that half on every pull request push. The manual Verify workflow runs `pnpm build`, then Playwright against `pnpm start`, with Postgres but no Convex. Its container already ships Chromium, Firefox and WebKit.
- **Tools.** `pnpm map:replay` uses the `mapFixture*` functions, `internalMutation`s deployed to every Convex deployment. No property-testing library, no crypto vectors.

Files: `docs/principles/testing-principles.md`, `vitest.config.ts`, `playwright.config.ts`, `.fallowrc.json`, `e2e/smoke.spec.ts`, `e2e/home-board.spec.ts`, `e2e/auth-seed.ts`, `src/platform/auth/synthetic-pilot.ts`, `convex/__tests__/modules.setup.ts`, `convex/mapFixture*.ts`, `src/scripts/map-replay.ts`, `src/app/api/telemetry/route.ts`, `.github/workflows/test.yml`, `.github/workflows/coverage-health.yml`.

## What changes

Nothing visible changes for users. Vitest and Coverage health also cover `sealed-service/**`. New fixtures: crypto vectors and recorded attestation documents. Verify's `build` job sets Part 25's E2E flag, and its `e2e` job gains local Convex and the dev sealed service. One map journey joins the smoke suite. A path-filtered Playwright job runs the vectors in three engines. Staging gains drills and a timing baseline.

## Design

### Test flavours for the new code

| Subject | Flavour | What must hold |
|---|---|---|
| Custody and workers | Co-located `*.test.ts` with fakes for ESI, EVE SSO, KMS, Convex and Neon | Every refusal path; wrap round trips; token compare-and-swap; two-strike `invalid_grant` |
| Sale flow (Part 14) | Custody tests with fake ESI and owner hashes | Mismatch removes named grants; block only if the buyer is still in a granted corp, recording only the buyer's account; notices queued; no key before the check; seller's other characters untouched |
| Map access (Parts 12, 13) | Worker tests over a fake access chain | Auto-admission; affiliation loss removes access at once and bumps the key epoch; corp-grant re-admission; a new member reads the last 7 days across epochs |
| Ported map logic (Part 16) | Today's Convex scenarios behind a small driver (`seedSystem`, `readSystems`, `runMutation`), one over convex-test, one over the in-memory `MapStore` | Same scenarios and expectations, bodies shared. The in-memory run in `sealed-service/` stays the gate once the Convex write path is deleted |
| Retention | Today's tests, ported | 7-day log and 24-hour undo |
| `src/lib/seal/` | Vectors in Node (Vitest) and Chromium, Firefox and WebKit (one Playwright spec, `page.evaluate`) | One committed set, including published HPKE vectors; ECDSA checked by verification only |
| Sealed documents in Neon | `*.db.test.ts` | A stale version write is refused |
| Location polling (Part 17) | Today's cadence tests on the worker scheduler, fake clock and ESI | 5-minute cold-off, 90-minute hidden cap, online gate, `Expires` cadence, 5-second floor |
| Personal sync (Part 18) | Existing `owner-sync` and `esi` tests through shared ports | Same results |
| Enclave input parsers | Fixture tests | Malformed ESI bodies, Convex rows and sealed requests rejected cleanly |

### Attestation and KMS without production keys

| Check | Where |
|---|---|
| Recorded staging documents (public proofs) verify at a fixed clock | CI |
| Synthetic documents from an in-test root: wrong root, expired leaf, unlisted PCR0, stale nonce, debug PCRs, altered signature | CI |
| The dev KMS stand-in enforces the real image-hash condition | CI |
| Each policy file denies unattested use and IAM delegation and lists exactly its environment's fingerprints | CI |
| Part 06's KMS drills and alerts, with the staging key | Staging |

### Smoke journeys against the dev sealed service

- **Build.** Verify's `build` job sets `LGI_E2E_DEV_ATTESTATION=1` (Part 25), so its artifact holds the dev root and pilot key release; it never deploys. `build:vercel` runs `assert-no-dev-attestation`, and a test checks that a build without the flag refuses the dev root. So "smoke passes" and "release refuses dev" are both proven.
- **Stack.** The `e2e` job starts the anonymous local Convex backend and `pnpm dev:sealed`.
- **Pilot keys.** Through Part 25's E2E Pilot key release only. There is no EVE SSO stand-in, so the authorize URL is untouched. If keys cannot travel in storage state, specs gain one arrange call, `signInSyntheticPilot(page)`.
- **Map journey.** Before Phase 1, on today's code, add and land green: open a seeded map at `/atlas?map=…`, see seeded systems and a connection, make one edit and see it confirmed, see the pilot's tracked location from a fixture. It passes unchanged after each mapper phase. It needs the real browser, auth and shell, so the principles allow it.
- **Board.** `home-board.spec.ts` keeps its demo board; a dev-only helper seals it as the pilot's view. That helper is a sealing oracle, so Part 25 needs a guard for it: refused under `NODE_ENV=production` without the flag, `VERCEL_ENV` or hosted store URLs, and tested.
- **Fixtures.** `mapFixture*` either writes sealed rows through the sealed service or is excluded from non-dev deployments.
- **Diagnostics.** Drop `127.0.0.1:3210` and `ERR_CONNECTION_REFUSED` from `CONSOLE_ALLOW`, and `va.vercel-scripts` once Part 26 drops Speed Insights. A `page.addInitScript` listener records `securitypolicyviolation` events; journeys assert none. Board and map journeys use the same diagnostics.

### Migration tests (Part 31)

Dual reads match with every fallback counted. Re-runs and interrupted runs end with identical rows. After each retiring migration, a real-Postgres test checks the live schema, and a Convex test checks that no write path, `mapFixture*` included, emits a plaintext row (allowed, since a live path could produce it). Logs, errors and telemetry carry codes only; the canary dump scan runs on staging.

### Adversarial tests (Part 28)

Rows 1 to 8, 17, 18 and 19 run in CI against fakes and the dev sealed service. Row 9 is a staging drill: stop the enclave and check the app degrades exactly as Part 29's failure table says, with the passkey or recovery-key option shown only then. Row 10 is a staging drill. Rows 12 and 15 (Reduced) are tested where their defences live (Part 28 rule 9): Part 26's CSP tests, where any CSP or Trusted Types violation fails the staging smoke run (Part 26 rule 12), and Part 26 rules 7, 8 and 11. Rule 7 is a staging check that the production policy is enforced before Phase 1's first key release; rules 8 and 11 are the ESLint and Fallow checks in `pnpm check` that keep `crypto.subtle`, `indexedDB` and `src/lib/seal/` inside the crypto zone and ban `eval`, `new Function`, `next/script` and un-nonced inline `<script>`. Row 14 (Mitigated after the window) is Part 28's Phase 5 adversarial test, a staging-then-production drill: Part 31's verification checklist over everything, including the canary scan of a fresh `pg_dump` and Convex export and the check that Neon history and Convex backup windows have passed. Rows 11, 13 and 16 are accepted, untested.

### Users notice nothing (Part 01)

One budget table, shared with Parts 01 and 07:

| Flow | Added p95 over today |
|---|---|
| Login, callback to signed in | 300 ms (Part 07) |
| Map open, to systems shown | 200 ms |
| Edit confirmation | 250 ms (Part 07) |
| Remote edit reaching another member | 300 ms (Part 01) |
| Location change reaching another member | 300 ms |
| Board and industry load | 200 ms |
| Access-list and character search | 200 ms (Part 07) |

Real EVE SSO cannot be scripted and staging refuses the pilot, so timings come from real staging use: duration events on `/api/telemetry` (codes and milliseconds only) plus enclave spans. Baselines are recorded from today's code before Phase 1; p95 is compared before each `staging` → `main` release, and the owner walks the main flows. New copy is a checklist item in Part 28's per-phase code review, not a CI word list.

### CI versus staging

| CI | Staging only |
|---|---|
| Vitest flavours, coverage, Fallow; browser vectors (path-filtered); smoke and map journeys; reproducible-build check (Part 27) | Enclave boot and unseal; KMS drills; live attestation; timing baselines and budgets; outage drill; restarts and Spot interruption; migration rehearsal |

### Dropped from older docs

From 01 "Crypto assurance plan" and 04 §26: ProVerif and Tamarin models, fast-check lifecycle models, the workerd simulator, Durable Object tests, real Safari in CI, the PRF device matrix per release, byte-exact CSP tests, external reviews. The cross-engine reducer corpus returns only under Part 15's Option 2.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Crypto vectors, recorded attestation documents | Yes (public repo) | No | CI |
| Test roots and keys | Never stored; made per test | n/a | CI |
| Dev root, dev KMS stand-in, pilot key release | Yes (dev and E2E builds only) | No | Dev sealed service |
| Synthetic pilot data | Metadata | Content, under dev keys | Dev sealed service and browser |
| Staging data | Metadata | Content, under the staging key | Staging sealed service and browser |
| Results, coverage, timing events | Yes | No | CI, staging telemetry, enclave spans |

## Hard rules

1. [Agreed] Users notice nothing (README principle 1).
2. [Proposed] Smoke and map-journey assertions stay unchanged; arrange steps may change.
3. [Agreed] `pnpm check` before every commit and `pnpm verify` before promote or release, with zero Fallow findings and no raised thresholds, overrides, baselines or suppressions.
4. [Agreed] No paid audits; assurance comes from agent reviews and tests.
5. [Proposed] `sealed-service/**` is inside Vitest, Coverage health and Fallow, under the same gates.
6. [Proposed] No committed fixture or CI job uses any real KMS key, and CI holds no AWS credentials. Staging drills use only the staging key; nothing outside production touches the production key.
7. [Proposed] Vitest stays offline: no live Convex, AWS, ESI or EVE SSO.
8. [Proposed] Every refusal branch in custody and `src/lib/seal/` has a test that reaches it.
9. [Proposed] One committed vector set runs in Node, Chromium, Firefox and WebKit.
10. [Proposed] Today's Convex scenarios keep the same behavioural expectations against the ported logic, through shared drivers, before the Convex write path is deleted.
11. [Proposed] Each Part 28 row a phase touches has a CI test or named staging drill before promotion.
12. [Proposed] Dev stand-ins and dev-only helpers (dev root, pilot key release, board-sealing helper) never reach release bundles, the image or hosted deployments, each guard tested. Only Verify's `build` job sets the E2E flag.
13. [Proposed] The map journey lands green on today's code before Phase 1.
14. [Proposed] Before each `staging` → `main` release, p95 timings meet the budget table and the owner walks the main flows; `.claude/skills/release/SKILL.md` and `.claude/skills/promote/SKILL.md` gain these steps.
15. [Proposed] Reproducible-build checks run in CI only.

## Assumptions

| Assumption | How to check |
|---|---|
| Recorded Nitro documents verify offline at a fixed clock | Record one before Phase 1 |
| Non-extractable keys cannot travel in storage state | Try `storageState({ indexedDB: true })` |
| Local Convex runs in the Playwright CI container | Prototype the Verify change |
| Extra Playwright projects add no Fallow findings | `pnpm check` on the adding PR |
| Published HPKE vectors cover DHKEM(P-256) with AES-256-GCM | Check before Phase 1 |
| WebKit is close enough to Safari for crypto | The owner's device check (Part 09) |
| Staging use yields enough samples for a stable p95 | Review the baseline count before Phase 1 |

## What users see

Nothing new. Testing changes only the repo, CI, staging and code-only telemetry events.

## Questions for the owner

1. **What runs in CI and what on staging?** *Recommended:* the split above.
2. **Coverage for enclave code?** *Recommended:* the same gates, plus hard rule 8 in code review. *Alternative:* a 100% branch gate for custody and `src/lib/seal/`.
3. **KMS and attestation without production keys?** *Recommended:* recorded documents and synthetic roots in CI, a policy-enforcing KMS stand-in, staging drills for real KMS.
4. **When do browser-engine vectors run?** *Recommended:* a path-filtered pull request job on `src/lib/seal/**`, the crypto worker and attestation code. *Alternative:* manual Verify only.
5. **Add `fast-check`?** *Recommended:* no; add it only if parser fuzzing finds something fixtures miss.
6. **Which login budget?** *Recommended:* Part 07's +300 ms, with Part 01's +1 s aligned to the shared table.
