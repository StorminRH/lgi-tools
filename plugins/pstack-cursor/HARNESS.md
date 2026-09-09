# Cursor runtime

Use native Task and the discovered agent names. The MODELS.json role's `model` is the complete configured slug, including modifiers. Use it for Task only if that session accepts the slug. `poteto-agent` remains an unpinned routing wrapper so it can inherit the requested role model; comment-sicko retains the existing Composer pin. General-purpose workflow reviewers use their own prompt templates, not the poteto wrapper.

Use local agents by default. A cloud Task requires that capability, an already-configured LGI environment, and user-selected cloud work. Respect actual depth and concurrency limits. Where `/loop`, `/goal`, sticky mode or an agent store is unavailable, report that capability gap and keep the work in the current session; do not pretend to arm it. Read only the active workspace's transcript paths. No global pstack-models rule is written or needed.

Read [LGI workflow](LGI.md) once before executing an entry skill, and [model choices](MODELS.json) before delegating. These repo adaptations replace conflicting upstream defaults in every linked playbook, reference and agent prompt. Skill names remain upstream names.

Resolve `references/`, `playbooks/` and `scripts/` relative to the skill that owns them, not the shell's working directory. Run tools with absolute paths while keeping the working directory at the target repository. The bundled watcher and orchestrator need Bun and authenticated GitHub CLI. Their bootstrap installs locked dependencies next to the scripts. If an installed plugin cache is read-only, execute the repository edition's script at the same pinned revision; do not disable sandboxing or change permissions to make a cache writable.

Model configuration is scoped to this plugin. Every entry in a panel list is one worker; the default is two. Reflect keeps its three distinct lenses. Never expand to upstream's four-model defaults when a configured slug fails. Check the session's tool schema, model picker or runtime metadata first. An unavailable model is a reported gap requiring a replacement choice, not permission to select an expensive fallback. A child's claim about its model is not runtime evidence.

The three Team Kit dependencies, deslop/control-ui/control-cli, are bundled at this same source revision. Native skill authoring support is a harness prerequisite when using the authoring workflows; report its absence instead of inventing a missing skill. No bundled automation is enabled by installation.
