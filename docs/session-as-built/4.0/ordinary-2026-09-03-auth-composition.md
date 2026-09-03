# Ordinary Work As-Built — Auth composition layer after runner injection

**Record status:** Final
**Recorded:** 2026-09-03
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/identity-auth-layer-remaining`
**PR:** `#109`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Login and session checks build in one composition layer.

- Changed: Login and session checks build in one composition layer.

## Divergences from plan

None.

## Final surfaces

- `src/composition/auth.ts` — constructs Better Auth with the composition runners
- `src/composition/session.ts` — session helpers moved from `platform/auth`
- `src/composition/route-guards.ts` — route/page guards moved from `platform/auth`
- `src/platform/auth/auth.ts` — `createAuth(runners)` factory; no singleton export
- `src/platform/auth/identity-projection-hooks.ts` — `IdentityProjectionRunners` type only
- `src/composition/map-access-identity.ts` — literal production runners; no register cell

## Discovered work

- Owner-hash reconciler cell (`owner-reconcile-hook` / `register-owner-reconciler`) stays a separate leftover. Thermo asked to inject it beside runners; rejected as out of scope for this packet (same note on Origin #64).
- Bundle coupling: routes that import session or route-guards now load the map-projection graph through `composition/auth`. No import-time side effects. Recorded for later weight if it shows up in cold starts.

## Successor notes

- Dump is GitHub #471 on `dump/2026-09-03-3a0fd4e4`. Do not merge that dump.
- CodeRabbit was rate-limited on the dump; Greptile returned 5/5 with no defects.
- Supersedes closed Origin #64.

## Verification summary

- **Adversarial review:** Subject: Origin `109`; `origin pr diff 109`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: comment-sicko corp-structures JSDoc and optional-hook skip accepted; thermo collapse of hooks factory and `bestEffort` unregistered arm accepted on v3; owner-reconciler injection and getUserInfo extract rejected as out of scope / pre-existing.
