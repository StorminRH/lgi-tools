# Set up pstack in Cursor and Codex

This branch adopts all 47 pstack skills at version 0.15.0, pinned to
[`df3fb154`](https://github.com/cursor/plugins/tree/df3fb154fb982fb83f649de8646d4af6a0cb16b3/pstack).
It also bundles the three Team Kit skills pstack calls: deslop, control-ui and control-cli.
The upstream names remain unchanged. The twelve older overlapping skills are replaced.
Unrelated custom skills remain available; poteto-mode is an explicit alternative to lifecycle.

## Install from this PR before merging

Use Python 3.11 or later. Check out `docs/github-operations-lgi-115` in the repository
you will open in each application. Keep that checkout at a stable path while testing.

```sh
python3 scripts/setup-pstack.py check
python3 scripts/setup-pstack.py install-cursor
python3 scripts/setup-pstack.py install-codex
```

The Cursor command copies `plugins/pstack-cursor` into the native local-plugin
folder. Cursor's local loader currently rejects a symlink whose target is
outside `~/.cursor/plugins/local`, so this edition copies rather than links.
Re-run `install-cursor` after you pull plugin changes or move this checkout.
Keep source edits in the repository edition, then refresh the copy. The Codex
command registers this repository's marketplace and installs `pstack-codex`.
It requires a Codex CLI release with `plugin marketplace add` and `plugin add`.
If that command is absent, update Codex through its normal installation channel;
do not copy the Codex skills into a directory Cursor also discovers.
If the marketplace name `personal` already belongs to another explicit marketplace,
stop and resolve that registration in Codex rather than replacing it.

Reload Cursor and verify the local plugin under Customize. Open a new Codex thread
in this trusted checkout so its `.codex/agents/*.toml` roles are loaded.
Disable any separately installed official pstack plugin while using this adoption.
Remove or disable user-level copies of the same skills if they appear as duplicates.
The installer does not delete global skills or change personal settings. It
refreshes only this edition's `pstack-cursor` copy.

Run the same installation in a cloud checkout when testing there. A local install
does not prove cloud discovery or model entitlement. Cloud environment provisioning
remains its own migration step.

## Check it once in each harness

1. Confirm the skill picker exposes `poteto-mode`, `how`, `architect`, `no-comments`
   and `setup-pstack` once, from the correct plugin edition. All skills in this
   adoption require explicit invocation; an invoked workflow can call its dependencies.
2. Invoke `how` on one small, known function. Ask for a read-only explanation with
   one delegate, no edits or app tests. Confirm the delegate returns a useful result.
3. Ask for one read-only probe per distinct configured model. Each probe returns
   one line. Inspect the harness's actual task details, trace or model metadata for
   the requested model and reasoning settings. A child's statement of its own model
   is not proof. Record settings that the harness does not expose as unverified.
4. Invoke poteto-mode with: "Investigate a small change to this function. Present
   the design and scope, then stop before implementation. No PR or app test run."
   Confirm it follows the checkpoint and uses this edition's models.
5. Optionally run the bundled PR watcher once, read-only, against this draft:

   ```sh
   bun plugins/pstack-cursor/skills/poteto-mode/scripts/watch-pr/watch-pr --help
   bun plugins/pstack-cursor/skills/poteto-mode/scripts/watch-pr/watch-pr --pr 497 --status-only
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
configuration, never a global always-applied rule. After changing Codex plugin
source, reinstall it through Codex and start a new thread to avoid a stale cache.

## What differs from upstream

- Separate native plugin packages prevent Cursor from discovering a second Codex
  copy of the same skills. Skill bodies, references and bundled scripts are retained.
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
- The two plugin packages are excluded from app TypeScript, ESLint and Fallow
  scans. Their Bun tools have their own package and tests. App test selection and
  all existing application checks remain unchanged.

`plugins/pstack-source.json` records the original revision and source hashes.
Each edition's `ADAPTATIONS.json` lists which upstream files changed and their
adopted hashes. Its upstream README remains as `UPSTREAM-README.md` for comparison;
use this guide and the edition's runtime configuration for installation and operation.

## Updates and rollback

Review upstream changes against the pinned revision before applying them. Keep
both native editions on the same upstream version and record intentional differences.
Do not overwrite local adaptations with an unreviewed upstream refresh.

For rollback before merge, disable the local plugin in each harness and return to
the previous branch. The removed repo skills return with that branch. Re-enable
any prior user-installed pstack only after disabling this adoption to avoid duplicates.
The Cursor copy lives under `~/.cursor/plugins/local/pstack-cursor`; remove
that folder if you abandon this checkout without refreshing the install.

Native installation references:
[Cursor plugins](https://cursor.com/docs/plugins),
[Codex plugins](https://developers.openai.com/codex/plugins),
[Codex custom agents](https://developers.openai.com/codex/subagents).
