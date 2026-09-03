# Ordinary Work As-Built — Remove the Under the Hood dev log

**Record status:** Final
**Recorded:** 2026-08-25
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/remove-devlog-6704`
**PR:** `#32`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

The Under the Hood pages are gone. Changelog stays in the footer as the remaining public document list.

- Removed: Under the Hood from the footer and those pages
- Removed: the privacy page's Under the Hood walkthrough link

## Divergences from plan

None.

## Final surfaces

- `src/app/(site)/devlog/` — deleted
- `src/features/devlog/` — deleted
- `content/devlog/` — deleted
- `src/components/composition/Footer.tsx` — Privacy, Contact, Changelog, version
- `src/composition/sitemap.ts` — sites and changelog only
- `src/components/ui/content-browser-view.ts` — flat `items` nav model
- `src/components/ui/prose.tsx` — single `prose-copy` reading class
- `.cursor/agents/comment-sicko.md` — pin `grok-4.6[effort=high,fast=false]`

## Discovered work

None.

## Successor notes

- Grouped content-browser folders existed for Under the Hood chapters. Changelog never used them. This close-out deleted `ContentNavGroup` and the `<details>` rail.
- `Prose` no longer takes a variant. Legal measure and spacing live on `.prose-copy`.
- Comment-sicko pin is operator-requested on this head, not dump material (`.cursor/` is excluded from the app-facing packet).
- Dump is GitHub #459. CodeRabbit finished with no actionable comments. Greptile did not reply. Dump disposition lives here and in chat.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `354e0849e3c672945fe6926bbeb413a61f40958d`..`origin/stormin/remove-devlog-6704` `47f12bd5`, then corrections on `09486d5e`, `840523bf`, `8d189f3e`, and `4329e712`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: leftover grouped ContentBrowser rail, one-member Prose variant, versions-drawer label, count-app-facing inclusion assertion, and `.prose-copy` narration comment accepted and fixed. Comment-sicko pin flagged as a drive-by and rejected because the operator asked for it. Structure and behavior were clean. Thermo correctness had no medium-to-high findings.
