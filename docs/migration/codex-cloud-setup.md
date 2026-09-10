# Codex Cloud GitHub prep

Notes for running Codex on this repo without reading
`.cursor/environment.json`. No Codex dashboard setting is changed here.
Written 10 September 2026.

## What to run

From a Codex local or cloud checkout:

```bash
bash .codex/setup.sh
```

The script sources `.cursor/lib.sh` for the local Postgres URL, anonymous
Convex selector, and hosted-URL refusals. It does not start Cursor terminals
or read `environment.json`.

If PostgreSQL 16 is missing, use [Local development](../../README.md#local-development)
Docker, or install Postgres 16 at `/usr/lib/postgresql/16/bin`. Do not point
Codex at hosted Neon or Convex for ordinary work.

## Pins that stay valid

| Pin | Where | Valid for Codex |
| --- | --- | --- |
| Codex reviewer and research models | `.codex/agents/*.toml` `model` and `model_reasoning_effort` | Yes. Native Codex metadata. |
| Codex skill invocation | `.agents/skills/*/SKILL.md` plus each skill's `agents/openai.yaml` | Yes. |
| Cursor pstack role map | `.cursor/rules/pstack-models.mdc` | No. Cursor Cloud copies that file into user rules. Codex does not read it. |
| Cursor terminals | `.cursor/environment.json` | No. Codex starts its own processes. |

Do not retune model slugs in this prep. [LGI-123](https://linear.app/lgitools/issue/LGI-123)
owns pin proof.

## Capability matrix

Empty evidence cells live in
[four-environment-capability-matrix.md](./four-environment-capability-matrix.md).
Fill them after a Codex cloud run. This file does not claim Codex matches
Cursor yet.

## Left for Ryan

Codex dashboard images, secrets, and paid capacity stay with Ryan.
