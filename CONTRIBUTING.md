# Contributing to LGI.tools

Thanks for your interest in contributing. LGI.tools is a multi-tool web
platform for [EVE Online](https://www.eveonline.com) players. For local setup,
see [Local development](README.md#local-development) in the README.

## Before you start

- **Open an issue first for anything non-trivial** so we can agree on the shape
  before code is written. Small, obvious fixes (typos, a broken link, a clear
  one-line bug) can go straight to a PR.
- **Be civil.** Reviews are conversations.

Architecture is deny-by-default Fallow (`.fallowrc.json`) plus lint. Use the
shared `src/components/ui/` primitives instead of importing their libraries
from feature code. Remaining source landmines live in [`src/AGENTS.md`](src/AGENTS.md).
Testing principles: [`docs/contributing/testing-principles.md`](docs/contributing/testing-principles.md).

## Commit style

Plain English. Describe what the change does for the project, not how the code is
structured — no file paths, function names, or jargon in the subject or body.

- **Subject:** one sentence, lowercase after the colon, under 72 characters.
- **Body (optional):** 3–5 bullets on what changed and why.

```
feat: add API endpoints for browsing and filtering wormhole sites

- sites can now be listed, filtered by class and type, and fetched by ID
- full site detail includes waves, NPC counts, and resource values
- invalid filters return a clear error instead of an empty result
```

## Opening a pull request

1. Branch off `main` and open your PR back into `main`.
2. Before you open the PR, run the cheap local gate: `pnpm typecheck`,
   `pnpm lint`, Fallow `dead-code`, `dupes`, and `health`, and focused tests for your
   diff. Standing done is the Origin PR's Depot pipeline (`verify` on every
   PR, plus `build` and `e2e` on PRs) — wait with
   **`origin pr checks --watch`**. Do not treat laptop `pnpm verify` as
   done, and do not run a full Depot `verify` locally just to run it again
   on the PR.
3. Fill in the PR template's **test plan** — what you verified and how.
4. Reference the issue the PR resolves (e.g. `Fixes #123`).

## Conduct, security & license

- This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
- To report a security vulnerability, see [SECURITY.md](SECURITY.md) — please
  **don't** open a public issue for it.
- LGI.tools is [MIT](LICENSE) licensed; contributions are made under the same
  license.
