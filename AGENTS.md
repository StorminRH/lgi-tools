# [LGI.tools](http://LGI.tools)

An EVE Online multi-tool focused on simplifying complex tasks.

## Work Flow

Work targets `development`. Promote is `development` → `staging`;
release is `staging` → `main`.

Sub-agent usage is encouraged, especially for context isolation.
For noisy work such as testing, documentation lookup, and exploring
the repository, isolate those tasks to a sub-agent.

Production builds run in CI and on Vercel; do not run them locally.
Cursor Cloud agents read [the cloud guide](.cursor/cloud-agent.md).

## Architecture

[.fallowrc.json](.fallowrc.json) defines the production-layer
boundaries. Preserve them. Use existing primitives; extract shared
code for a real second consumer.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.