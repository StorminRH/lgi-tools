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
2. Run **`pnpm verify`** locally and confirm it passes — this bundles
   `typecheck`, zero-warning `lint`, one coverage-enabled Vitest suite, and
   `fallow` (dead code, duplication, complexity, and architecture boundaries).
   CI installs with the frozen lockfile, runs those same four gates, and also
   runs the route-classification presence check (`assert:routes-present`).
3. Fill in the PR template's **test plan** — what you verified and how.
4. Reference the issue the PR resolves (e.g. `Fixes #123`).

## Conduct, security & license

- This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
- To report a security vulnerability, see [SECURITY.md](SECURITY.md) — please
  **don't** open a public issue for it.
- LGI.tools is [MIT](LICENSE) licensed; contributions are made under the same
  license.
