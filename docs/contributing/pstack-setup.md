# Set up pstack in Cursor and Codex

This branch adopts all 47 pstack skills at version 0.15.0, pinned to
[`df3fb154`](https://github.com/cursor/plugins/tree/df3fb154fb982fb83f649de8646d4af6a0cb16b3/pstack).
It also bundles the three Team Kit skills pstack calls: deslop, control-ui and control-cli.
The upstream names remain unchanged. The twelve older overlapping skills are replaced.
Unrelated custom skills remain available; poteto-mode is an explicit alternative to lifecycle.

## Open the repository checkout

Use Python 3.11 or later. Clone or check out this branch in the repository you
will open in Cursor or Codex, then run:

```sh
python3 scripts/setup-pstack.py check
```

The skills live directly in `.cursor/skills/<name>` and `.agents/skills/<name>`.
Cursor agents live in `.cursor/agents`; Codex roles live in `.codex/agents`.
Each harness root holds its shared `HARNESS.md`, `LGI.md`, and `MODELS.json`.
A pull updates the source used by the next session. Open a fresh Cursor chat or
Codex task in this trusted checkout after pulling changes to skills or roles.
When both skill trees are visible, select the active harness's path as directed
by root `AGENTS.md`.

The checker reads repository files only. It validates native skill policies,
required resources and model pins. Cloud checkouts use these same tracked roots;
validate discovery and model entitlement in a fresh cloud session as well.

## Check it once in each harness

1. Confirm the skill picker exposes `poteto-mode`, `how`, `architect`, `no-comments`
   and `setup-pstack` from the active harness’s native skill directory. All skills in this
   adoption require explicit invocation; an invoked workflow can call its dependencies.
2. Invoke `how` on one small, known function. Ask for a read-only explanation with
   one delegate, no edits or app tests. Confirm the delegate returns a useful result.
3. Ask for one read-only probe per distinct configured model. Each probe returns
   one line. Inspect the harness's actual task details, trace or model metadata for
   the requested model and reasoning settings. A child's statement of its own model
   is not proof. Record settings that the harness does not expose as unverified.
   On Codex surfaces with `fork_turns`, use `fork_turns: "none"` for pinned roles
   and supply the task and file pointers explicitly. Full-history forks inherit
   the parent model and effort even when a named role has different pins.
4. Invoke poteto-mode with: "Investigate a small change to this function. Present
   the design and scope, then stop before implementation. No PR or app test run."
   Confirm it follows the checkpoint and uses this edition's models.
5. Optionally run the bundled PR watcher once, read-only, against this draft:

   ```sh
   bun .cursor/skills/poteto-mode/scripts/watch-pr/watch-pr --help
   bun .cursor/skills/poteto-mode/scripts/watch-pr/watch-pr --pr 497 --status-only
   ```

   Use the Codex edition's corresponding path when testing it. The tools need Bun
   and authenticated `gh`. Their first run installs the dependencies pinned by the
   bundled lockfile. They do not need the app's production build.

These checks validate discovery, delegation and configuration. They do not require
a real feature implementation, a merge, or a full app test suite. Missing tools or
rejected model slugs are setup findings to fix before merging.

## Configured models

| Work | Cursor | Codex |
| --- | --- | --- |
| Implementation, exploration, documentation retrieval | Existing Grok 4.6 high/fast choice | GPT-5.6 Sol, high |
| Judgment, synthesis, prose writing, bug/performance work | Existing GLM 5.2 high choice | GPT-6 Astra, high |
| Hardest tasks | Existing Grok 4.6 xhigh/fast choice | GPT-6 Astra, high |
| Mechanical work and comment cleanup | Existing Composer 2.5 fast choice | GPT-5.6 Terra, medium |
| Arena, architect, interrogate panels | Grok + GLM, two workers | Sol + Astra, two workers |

Exact slugs live in each edition's `MODELS.json`. These choices are configured,
not a claim of runtime availability. Codex roles pin the matching model and effort.
Reflect retains three separate lenses. Existing custom reviewer and test-runner
pins are preserved, including Terra for the existing Codex test runner; the Spark
experiment is not part of this installation.

Use `setup-pstack` to inspect or change this edition's choices. It writes repository
configuration, never a global always-applied rule. After changing role or skill
source, start a fresh task so the harness reloads it.

## What differs from upstream

- Native skill directories retain skill bodies, references and bundled scripts.
  Root `AGENTS.md` selects the active harness when both trees are discovered.
  Codex receives native role TOMLs and manual-invocation metadata.
- GitHub is the only PR host; feature branches target development. PRs open as drafts.
  The user reviews the design before implementation unless already approved.
  Linear holds handoffs. Staging/main close-out rules remain in force.
- Repo-scoped model choices replace expensive upstream defaults. Native runtime
  guidance handles Codex delegation, transcripts and unavailable cloud/scheduling APIs.
- Verification follows the changed surface. The upstream large-program template
  does not impose ten browser lanes on ordinary features or documentation changes.
- Worktree/simulator cleanup is audit-only because the upstream helper makes
  unsafe assumptions about untracked work and closed PRs and depends on macOS tools.
- Automations are included as upstream source, but none are scheduled or enabled.
- The vendored poteto-mode script directories are excluded from app TypeScript,
  ESLint and Fallow scans. Their Bun tools have their own package and tests. App test selection and
  all existing application checks remain unchanged.

`docs/contributing/pstack-source.json` records the original revision and source hashes.
Each edition's `ADAPTATIONS.json` lists which upstream files changed and their
adopted hashes. Its upstream README remains as `UPSTREAM-README.md` for comparison;
use this guide and the edition's runtime configuration for setup and operation.

## Updates and rollback

Review upstream changes against the pinned revision before applying them. Keep
both native editions on the same upstream version and record intentional differences.
Do not overwrite local adaptations with an unreviewed upstream refresh.

For rollback before merge, return to the previous branch and start a fresh session.
The tracked skills and roles follow that checkout.

Native discovery references:
[Cursor skills](https://cursor.com/docs/skills),
[Codex skills](https://developers.openai.com/codex/skills),
[Codex custom agents](https://developers.openai.com/codex/subagents).
