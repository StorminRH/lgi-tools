# Ordinary Work As-Built — Plain-speech v4 changelog and Atlas guest landing

**Record status:** Final
**Recorded:** 2026-09-03
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `copy/v4-changelog-plain-language`
**PR:** `#110`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

The published v4.0 changelog reads in plain speech for players, with shop-talk lines kept short for open-source readers. The signed-out Atlas landing, home Atlas card, and Atlas page metadata share a shorter product line and simpler tracking setup steps. Changelog and as-built schemas now require that voice for future releases.

- Changed: v4.0 changelog entries and master summary rewritten in player speech
- Changed: signed-out Atlas landing subtitle, gate reason, and setup steps shortened
- Changed: home Atlas card and Atlas page metadata match the guest subtitle
- Changed: changelog-entry and session-as-built schemas require plain-speech bullets; close-out rewrites as it lifts

## Divergences from plan

None.

## Final surfaces

- `content/changelog/v4.0.md` — published v4.0 release notes in player speech
- `docs/workflows/schema/changelog-entry.md` — entry form plus Voice table for player speech vs shop talk
- `docs/workflows/schema/session-as-built.md` — Delivered outcome points at that voice
- `.cursor/skills/close-out/SKILL.md` — lift bullets rewritten into player speech
- `src/app/(site)/atlas/AtlasGuestLanding.tsx` — guest subtitle, gate reason, SETUP_STEPS
- `src/app/(site)/atlas/page.tsx` — Atlas metadata description
- `src/components/composition/HomeFeatureCards.tsx` — Atlas home card description

## Discovered work

None.

## Successor notes

- Changelog loader uses `use cache` with `cacheLife('max')`. Local markdown edits need a Next restart before `/changelog` shows the new text.
- Greptile P2: tracking cannot be toggled inside the create-map dialog. Keep guest setup copy on open-map behavior.
- Duplicate `### v4.0.5.1` headings (2026-09-02 and 2026-08-15) predate this PR. Leave for a later identity cleanup.
- Dump is GitHub #472.

## Verification summary

- **Adversarial review:** Subject: Origin `110`; `origin pr diff 110`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko; Runtime identity: requested=agent-file-pin, observed=Not fully observable (`origin pr diff` 403 in some seats; local `origin/staging..HEAD` used); Verdict: `CORRECTIONS_REQUIRED` then batch on version 2; Disposition: close-out wrap and Greptile tracking-create copy accepted; ESI-scope disclosure drop, duplicate v4.0.5.1, and triple tagline extract rejected.
