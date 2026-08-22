# Ordinary Work As-Built — Staging Preview, fail-closed tests, and Linear feedback

**Record status:** Final
**Recorded:** 2026-08-22
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#21`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Staging Preview now lives at https://staging.lgi.tools and talks to Convex staging. The feedback chip asks for a title and files a Linear issue instead of a GitHub Issue.

- Changed: staging Preview uses the durable staging host and Convex staging
- Changed: in-app feedback requires a title and opens a Linear issue
- Fixed: a blank LGI database override no longer disables advisory locks

## Divergences from plan

None.

## Final surfaces

- `src/scripts/vercel-convex-deploy.ts` — staging Preview may disable Convex's prod-key-on-preview guard
- `src/lib/env.ts` — `LGI_DATABASE_URL` / `LGI_DATABASE_URL_UNPOOLED` win over Neon Connect injects
- `src/db/index.ts` — lock URLs resolve through `readEnv` with empty LGI keys missing
- `src/platform/auth/service-client.ts` — `x-vercel-protection-bypass` when the secret is set
- `src/config/site-url.ts` — `PRODUCTION_SITE_URL`; staging sets `NEXT_PUBLIC_SITE_URL`
- `src/features/feedback/create-linear-issue.ts` — Linear `issueCreate` for `/api/feedback`
- `src/composition/__tests__/widget-host-registry.ts` — mapper and preview may only host `widget.tsx`
- `package.json` — `coverage-gaps` on `pnpm fallow` and local health

## Discovered work

None.

## Successor notes

- Staging marker detection stays an OR of git ref, `VERCEL_TARGET_ENV`, and `LGI_PREVIEW_LINE`. Origin deploys may omit the git ref. Do not put the production Convex deploy key on Preview.
- `package.json` `bugs.url` still points at GitHub Issues. GitHub remains the dump remote. Left as-is.
- Widget-host scan covers quoted static and dynamic imports. Side-effect and template-literal `import()` forms are unused on current hosts.
- Comment-sicko reshape flags on `feedbackRequestSchema` `* 4` caps, verbatim `DATABASE_URL_UNPOOLED` empty-wins-`??`, `getDb` `as unknown as Db`, and `getDirectClient` `max: 3` stay open. This close-out does not rename those.
- Feedback remounts on open via `formKey`. Do not remount on close; Base UI needs the same instance for the exit transition.
- GitHub #456 CodeRabbit posted four inline notes. All rejected: blank `DATABASE_URL_UNPOOLED=` is empty-as-unset (install script fills local), restore editor-success pins do not need a prior sever (sever-then-restore lives later in `mapAuthoring.test.ts`), widget-host scan still skips side-effect and template-literal `import()` (no current host uses those for feature UI), and JSDoc on `FEEDBACK_TITLE_MAX_LENGTH` / `buildFeedbackIssueTitle` loses to no-comments. Two nitpicks in the same review (JSDoc on staging Convex exports, shared coverage-test mocks) left unfixed for the same reasons.
- Greptile did not reply on GitHub #456. CodeRabbit did.
- This Cloud Agent Origin token cannot open review threads or comments. Dump disposition lives here and in chat.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `9ca04d09545483aa6e84f47bcaf55afa6e9affe9`..`origin/development` `4fb5c84bd47897353ab51e7a4e8a0d59be1be61f`, then corrected on `06cbeb85b4787b646dc12a1b5898fc60586176dd`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: empty LGI lock-URL override, README Linear-feedback leftover, Convex bypass env note, and feedback open-remount accepted and fixed. Staging marker OR-chain rejected as the documented Origin fallback. Widget-host side-effect/template-literal scan and Fallow rewrite rejected. `package.json` bugs.url rejected as dump-remote metadata. Feedback gate judo and test-only staging exports rejected. Comment-sicko deleted narration comments; env required/verbatim contract restored.
