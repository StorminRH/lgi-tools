## Closing Notes

The strange thing about this project is that it is both more and less than I expected when I started.

It is more because a personal spreadsheet replacement turned into a real web application: authentication, EVE data ingestion, market prices, an industry planner, live account surfaces, corporation data gates, admin tooling, telemetry, and now the groundwork for a mapper. That is far beyond what I could have built in the conventional way.

It is less because the important lesson was not “AI can build anything.” That framing is too simple and too flattering to the tool. AI can generate an enormous amount of code quickly. The hard part is deciding what shape the system should have, recognizing when a shortcut is unsafe, and turning every mistake into a rail that future AI sessions have to respect.

A lot of this dev log is really a record of changed rules.

I started with a borrowed Sheet and learned that a source can be useful without remaining authoritative. I started with ESI fetches and learned that “call the API” is not a real instruction until identity, compatibility date, timeout, cache window, budget, and failure mode are all defined. I started with live trackers and learned that live-looking UI does not always need live infrastructure. I started with account login and learned that EVE identity is not one user flag; it is user, character, active character, owner hash, scope health, token custody, unlink, purge, and transfer safety.

I also learned that the app can be wrong without looking wrong. A route can render while its build mode silently changed. A cron can be healthy while waking a database for no reason. A cached body optimization can corrupt a caller’s response. A permission loss can leave stale data on screen. A comment can be technically harmless and still mislead the next AI agent.

That is why the repo has so many rails now. TypeScript, Zod, Drizzle, route assertions, ESLint, Fallow, coverage, CI, Vercel build checks, Greptile, and the repeated code-level comments are not process for its own sake. They are how the project remembers what it learned.<sup><a href="#code-closing-verify">1</a></sup>

The best parts of LGI.tools are the places where the architecture became explicit enough that an AI agent has a narrow safe path to follow. The weakest parts have usually been the places where I gave the agent a broad instruction and then had to come back later with a clearer boundary.

That is the main thing I would tell someone reading this as an AI-built software project: the code can be AI-generated, but the responsibility cannot be. My job is not to type every line. My job is to decide what should be true, direct the agents toward that shape, inspect the result, add the missing rails, and keep the repo from forgetting.

LGI.tools is still not finished. The mapper will probably force another round of architectural corrections. New EVE features will expose new permission edges. Scaling will keep finding fixed costs hiding in places that look small. Some of the rules in this log will be refined or replaced.

That is fine. The goal is not to pretend the architecture was obvious from the start. The goal is to keep learning in public, keep the code honest, and keep turning mistakes into structure.

This is the snapshot for now.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-closing-verify" file="package.json" lines="43-48" lang="json" -->
```json id="u9sh84"
{
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "fallow": "fallow audit --fail-on-issues",
  "fallow:health": "fallow health --coverage coverage/coverage-final.json",
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
}
```
<!-- uth:code-excerpts:end -->
