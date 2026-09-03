# Ordinary Work As-Built — Identity projection runner injection

**Record status:** Final
**Recorded:** 2026-09-03
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/identity-runners-split-9f6a`
**PR:** `#108`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `src/platform/auth/identity-projection-hooks.ts` — `createIdentityProjectionRunners` plus the registered compatibility cell
- `src/composition/map-access-identity.ts` — production runners and the boot-time register call
- `src/composition/auth.ts` — server-only re-export of the existing Better Auth instance
- `src/platform/auth/admin-users.ts` — `deleteLinkedCharacter` and `reassignCharacter` take runners
- `src/platform/auth/account-purge.ts` — `reconcileAfterCharacterRemoval` takes runners
- `src/platform/auth/owner-transfer.ts` — `absorbLinkedCharacterOnProof` takes runners

## Discovered work

- Remaining auth-layer move is still Origin #64 on `stormin/identity-projection-runners-ff09`. It creates auth at composition, moves session and route-guard helpers, and deletes the compatibility cell.
- `import '@/composition/map-access-identity'` in `src/composition/purge/orchestrator.ts` and `src/app/api/account/purge-character/route.ts` no longer does work for those graphs. Left in place. The `[...all]` import must stay until the cell is gone.

## Successor notes

- Better Auth `getUserInfo` and `account.create.after` still read `registeredIdentityProjectionRunners` / `runAfterCharacterLinkChanged`. Do not drop the `[...all]` side-effect import before those call sites take an injected runner.
- `src/composition/auth.ts` is a re-export, not a second instance. Route tests that mock `auth` and `checkSession` still need both `@/composition/auth` and `@/platform/auth/auth` because `session.ts` imports `./auth` relatively.
- Dump is GitHub #470. Do not merge that dump.

## Verification summary

- **Adversarial review:** Subject: Origin `108`; `origin pr diff 108`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: comment-sicko registration JSDoc deletion already on v2. MUST KILL reshape flags, dual runner surfaces, dead side-effect imports, `[...all]` auth retarget, route-test shape asserts, mixed `runners` placement, registry spy, and CodeRabbit JSDoc rejected.
