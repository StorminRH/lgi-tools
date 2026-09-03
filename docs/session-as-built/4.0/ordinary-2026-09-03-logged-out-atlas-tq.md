# Ordinary Work As-Built — Logged-out Atlas gate and Tranquility status

**Record status:** Final
**Recorded:** 2026-09-03
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/ux-logged-out-staging-f056`
**PR:** `#107`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Signed-out visitors see the Tranquility player count in the header the same way signed-in ones do. Opening `/atlas` without a session lands on a sign-in page that keeps a shared map link through login, instead of an empty catalogue with Create and Trash.

- Added: signed-out `/atlas` sign-in landing with the tracking setup path
- Fixed: logged-out visitors see a live Tranquility player count instead of a stuck offline chip

## Divergences from plan

None.

## Final surfaces

- `src/app/(site)/atlas/AtlasBound.tsx` — signed-out gate to guest landing; auth-store failure still degrades to catalogue
- `src/app/(site)/atlas/AtlasGuestLanding.tsx` — sign-in gate and setup steps
- `src/components/composition/account/LoginButton.tsx` — `EveSignInButton` with `callbackURL`
- `src/features/maps/map-navigation.ts` — `atlasSignInReturnHref` keeps only `map`
- `src/components/composition/AppHeader.tsx` — nav status waits on `connection()`
- `src/data/eve-status/queries.ts` — shared remote status fill; offline expire 60s

## Discovered work

- Identity projection runners (Origin #64 / Linear LGI-76) stayed out of this promote. Alone it is 111 app-facing files versus staging (mirror cap 100). Left on `development` until split.
- Thermo-CQ optional: pass `returnHref` from the page so `AtlasGuestLanding` need not be a client component. Deferred.

## Successor notes

- `gate?.ok === false` is the only path to the guest landing. A thrown `checkSession` still means catalogue unavailable, not "sign in required".
- Offline status expire is 60s on purpose so a fail-closed fill is a short dynamic hole, not a long-lived "TQ · offline" in the public shell.
- Dump is GitHub #469. Combined-all-three reference branch `stormin/combine-drafts-staging-f056` is not this promote.

## Verification summary

- **Adversarial review:** Subject: Origin `107`; `origin pr diff 107`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: comment-sicko guest-landing JSDoc deletion accepted. CodeRabbit export-JSDoc comments rejected. Thermo-CQ server `returnHref` deferred. Freeze seats had no accepted findings.
