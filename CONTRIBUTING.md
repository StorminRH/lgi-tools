# Contributing to LGI.tools

Thanks for your interest in contributing. LGI.tools is a multi-tool web
platform for [EVE Online](https://www.eveonline.com) players. For local setup,
see [Local development](README.md#local-development) in the README.

## Before you start

- **Agree on the shape first** for anything non-trivial. Small, obvious
  fixes (typos, a broken link, a clear one-line bug) can land directly.
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

## Landing and review

1. Land on Origin `development`. Promote is an Origin PR
   `development` → `staging`. Release is `staging` → `main`. Those
   merges, and any other merge onto `staging` or `main`, run through
   close-out.
2. Before you land, run the local test suite: `pnpm typecheck`,
   `pnpm lint`, Fallow `dead-code`, `dupes`, and `health`, and focused tests
   for your diff. A promote or release waits on that Origin PR's Depot
   pipeline (`verify` on every PR, plus `build` and `e2e` on PRs) with
   **`origin pr checks --watch`**. Laptop `pnpm verify` is not done.
3. Fill in the PR template's **test plan** — what you verified and how.
4. Open Origin PRs and GitHub dump PRs ready for review so Depot runs once.
   `origin pr create` defaults to draft; pass `--status open`.
5. A GitHub dump is the app-facing files from
   `python3 tools/cli.py lifecycle count-app-facing --list`. Pass `--base`
   and `--head` for the two lines of that PR. Defaults are
   `origin/staging` and `origin/development`. Same isolation as the review.
   Skills and standing docs stay off that packet.
6. CI failures and review findings go on Origin threads for the
   version that failed. Reply with the fix. A push cuts the next
   version.

## Conduct, security & license

- This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
- To report a security vulnerability, see [SECURITY.md](SECURITY.md) — please
  **don't** open a public issue for it.
- LGI.tools is [MIT](LICENSE) licensed; contributions are made under the same
  license.
