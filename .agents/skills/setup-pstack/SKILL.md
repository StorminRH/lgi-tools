---
name: setup-pstack
description: Verify or change this repo's pstack model choices when explicitly asked to set up pstack or configure its models.
---

# Setup pstack

Read [the runtime configuration](../../HARNESS.md), then open this edition's MODELS.json.

1. Enumerate models and role configuration from the current harness's actual tools, settings or documented model listing. If unavailable, ask for the picker/runtime evidence. Do not infer availability from a model name in this file or from a child's self-report.
2. Show the current role choices and mark unresolved slugs. A panel's array length is its fan-out. Preserve the three reflect lenses. Ask which choices the user wants changed only when the request has not already specified them.
3. Validate each chosen slug and effort against the live harness. Stop the affected delegation if unavailable; keep the current file until a replacement is chosen. Do not silently fall back to expensive upstream defaults.
4. Edit only this repository edition's MODELS.json. In Codex, a pinned agent can serve several role entries. Update every MODELS.json entry referencing that agent together with its TOML, or create a separate pinned role when only one assignment should change. Preserve the existing comment-sicko pin in both harnesses. Never modify unrelated reviewer/test-runner pins or a global model rule.
5. Reinstall/reload the edition and open a new session. Run one bounded read-only delegation and compare the runtime's model/effort metadata to the chosen configuration. Record configured versus observed values and any evidence the harness cannot expose.
6. Report the change and verification. A verification skill is optional: use the repo's existing Playwright/e2e setup first. Offer create-verification-skill only if a needed capability is absent; do not generate or replace the user's UX skill without a separate request.
