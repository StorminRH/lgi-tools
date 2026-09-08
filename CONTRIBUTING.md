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
For data ownership, lifecycle, projections or schema changes, follow
[data design](docs/contributing/data-design.md). Scheduled maintenance has
separate [data audit](docs/workflows/data-design-audit.md) and
[test cleanup](docs/workflows/test-cleanup.md) procedures.

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

Use the canonical [delivery procedure](docs/workflows/delivery.md) for the
prepared GitHub workflow and its coordinated activation boundary. It owns
one actual PR per change, candidate material before freeze, required reviews,
current CI proof, Linear receipts and integration ancestry.

Select and reuse local checks with the [verification contract](docs/workflows/verification.md).
Fill the PR template's test plan with actual executed/reused evidence and
explicitly distinguish checks that were not required or not run. Pure prose
needs no application suite; executable guidance and tooling receive focused
contract checks. Application scope retains the appropriate local gates.

Public requests use the contact route on [LGI.tools](https://lgi.tools).
Maintainers track accepted work and durable handoffs in Linear. GitHub Issues
is not a parallel project backlog.

## Conduct, security & license

- This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
- To report a security vulnerability, see [SECURITY.md](SECURITY.md) — please
  **don't** open a public issue for it.
- LGI.tools is [MIT](LICENSE) licensed; contributions are made under the same
  license.
