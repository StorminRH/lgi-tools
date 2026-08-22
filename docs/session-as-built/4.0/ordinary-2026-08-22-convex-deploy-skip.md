# Ordinary Work As-Built — Skip the Vite convex-test module map on Convex deploy

**Record status:** Final
**Recorded:** 2026-08-22
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#23`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `convex/__tests__/modules.setup.ts` — convex-test module map; two-dot basename keeps Convex deploy from treating the Vite `import.meta.glob` helper as an entry
- `convex/__tests__/modules.test.ts` — census of production modules plus recursive multi-dot helper names

## Discovered work

None.

## Successor notes

- Convex's bundler skips a basename with more than one `.`. `__tests__/` is not a skip. A single-dot helper under `convex/` is a deploy entry.
- Comment-sicko flagged the explicit `import.meta.glob` path list as a Fallow-cycle workaround (`modules` MUST KILL). Left as-is. A production-only glob is a later reshape, not this promote.
- Other comment-sicko reshape flags (`argsFor` `as never`, multi-page `result`, `apply` null trio, `codeOnly`) are pre-existing and out of this packet.
- Dump is GitHub #457. CodeRabbit finished with no actionable comments. Greptile did not reply. Origin token still cannot open review threads. Dump disposition lives here and in chat.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `692206fa377c2a728bd30caeeac66addcc538dcd`..`origin/development` `9309b38591765fde55e8054d34114781c7613210`, then corrected on `fa7f488e` and `31a2693b`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: recursive helper census accepted and fixed. Comment-sicko narration deletions accepted. Two-dot Convex keep retained. Explicit glob reshape and leftover MUST KILL flags rejected as out of packet.
