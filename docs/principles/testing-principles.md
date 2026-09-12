# Testing principles

This codebase favors small, readable test suites with explicit setup and minimal
magic. Individual tests should follow a meaningful workflow end-to-end, even
when that makes a single test longer and more assertion-heavy.

Adapted from the
[Kent C. Dodds / kody testing guidance](https://github.com/kentcdodds/kody/blob/main/docs/contributing/testing-principles.md)
for this repository's Vitest, Postgres, Convex, and Playwright stack.

## Test flavor decision matrix

Choose the lightest flavor that can falsify the behavior. Filename and directory
pick the runner (`vitest.config.ts` vs `playwright.config.ts`):

| Flavor / command | Use when | Avoid when |
| --- | --- | --- |
| Co-located `*.test.ts` / `*.test.mjs` (`pnpm test`) | Pure functions, view-models, handlers with local fakes, and Convex logic under `convex-test`. Add `// @vitest-environment edge-runtime` when the assertion needs that isolate. Discovery: `src/**/*.test.ts`, `convex/**/*.test.ts`, `scripts/**/*.test.mjs`, `e2e/**/*.test.ts`. | The assertion needs real SQL, a real browser, or authenticated UX. |
| Real-Postgres `*.db.test.ts` (`pnpm test`) | Behavior that depends on real SQL, transactions, advisory locks, or Neon-shaped constraints via `createDbTestHarness` in `src/db/__tests__/support/db-test-harness.ts`. | Pure logic that never touches the DB — keep those in ordinary `*.test.ts`. Do not invent alternate DB harnesses. |
| Playwright (`pnpm test:e2e`) | A very small number of user-critical happy-path journeys through the Next app. See [end-to-end testing](./end-to-end-testing.md). | Edge cases, copy pinning, or anything a faster unit/integration test can cover. |

**Map access example:** in `*.test.ts`, assert the projection or view-model
against fixtures. In `*.db.test.ts`, call `createDbTestHarness` and assert claim
rows. In `convex/**/*.test.ts`, construct `convexTest(schema, modules)` from
`convex/__tests__/modules.setup.ts` and assert `requireMapAccess` outcomes
instead of spying.

Shared test helpers live under `src/db/__tests__/support/` and
`convex/__tests__/*.setup.ts`. Import factories explicitly inside each test (or
a per-test factory). Harness-owned `beforeAll` / `beforeEach` for disposable
schema lifecycle is the exception — do not introduce extra hooks that hide
arrange steps. That conflicts with the principles below.

Do not spin a live Convex deployment for the Vitest gate.

## Principles

- Prefer the "fewer, longer tests" style from Kent C. Dodds when assertions
  belong to one workflow.
- Treat each test like a manual tester's script: one setup, then as many actions
  and assertions as needed to validate the whole journey.
- Do not split a single flow into many tiny tests just to satisfy "one assertion
  per test." Multiple related assertions in one test are a feature, not a smell.
- Prefer flat test files: use top-level `test(...)` and avoid `describe`
  nesting.
- Avoid shared setup like `beforeEach`/`afterEach`; inline setup per test.
- Avoid shared mutable test state across cases. If the next assertion depends on
  the same rendered object, request, or response, it likely belongs in the same
  test.
- Do not add tautological assertions. An assertion is tautological when it
  cannot fail unless the implementation and the test change in lockstep — there
  is no independent oracle. Typical forms:
  - Identity predicates: `isFoo(FOO_CONSTANT)` when `isFoo` is `===`,
    `includes`, or `Set.has` of that same constant. Keep the interesting
    branches (normalization, prefix/suffix, negatives, Error wrapping, cause
    chains).
  - Constant-to-self pins: `expect(EXPORTED_DAYS).toBe(14)` or
    `expect(exportedDelays).toEqual([100, 500, 1_500])`. If the value is a
    public contract, assert it where a caller observes it (serialized payload,
    HTTP body, retry `nextDelayMs`), not on the export itself.
  - Algorithm echo: building `expected` with the same helper the production
    function uses (`shellQuote(x)` on both sides; picking the same fields
    `toSummary(post)` returns). Use an independent oracle (hardcoded quoted
    string, live schema after migration).
  - Self-equality: `equal(x, x)`. Type-only checks, instructional-copy pins, and
    a lone "q is not there" after a deletion (later bullets) are the same
    failure mode.
- Don't write tests for what the type system already guarantees.
- Use disposable objects only when there is real cleanup. If no cleanup, skip
  `using` and `Symbol.dispose`.
- Build helpers that return ready-to-run objects (factory pattern), not globals.
- Keep test intent obvious in the name: "auth handler returns 400 for invalid
  JSON".
- Write tests so they could run offline if necessary: avoid relying on the
  public internet and third-party services; prefer local fakes/fixtures.
- Keep the bar for adding tests high, especially slower integration and E2E
  tests.
- Prefer fast unit tests for server logic; keep e2e tests focused on a very
  small number of important happy-path journeys.
- Treat `e2e/*.spec.ts` as a tiny browser smoke suite. Do not add
  capability-by-capability coverage there unless the failure mode depends on the
  real browser, auth cookie, and app shell.
- Prefer asserting intermediate states inside the broader workflow that causes
  them rather than adding isolated tests that only check an incidental loading
  or transition state.
- Do not add regression tests for bugs that are unlikely to happen again unless
  the flow is important enough to justify the maintenance cost.
- Avoid tests that only assert a string blob contains a description or other
  incidental copy. Favor behavior-focused assertions (structured output,
  user-visible outcomes, or stable public contracts) instead.
- Do not add tests whose only value is pinning configuration-style strings such
  as tool descriptions, usage hints, warnings, or other instructional copy. If
  the behavior matters, test the behavior or stable structured contract rather
  than asserting that specific prose appears.
- Keep absence assertions that flip state. "x is there, z is not; click y; now x
  is gone and z is there" is useful. A lone "q is not there" after q was deleted
  is not. That only fails if someone pastes the old name back. Fine to use
  locally while deleting; do not commit it. Same for old class names, filenames,
  aria-labels, CSS selectors, retired capability ids, and deleted table names on
  a static inventory list. Absence is still a good assertion when a live path
  could show the thing: loading vs ready, empty vs populated, secret vs
  redacted, admin vs user, or generated SQL vs a table the generator could still
  emit.
- Run server/unit tests with `pnpm test` (plus targeted Vitest paths when
  needed) to avoid Playwright spec discovery (`e2e/**/*.spec.ts`).
- House registry, Fallow, and ESI-dataset declaration suites are load-bearing
  gates — do not delete them as "cruft" without an explicit replacement.
- Each test should start with a clean mock slate; inline the setup a test needs
  rather than relying on leftover state from a prior case. Keep explicit
  mid-test resets only when one workflow test runs multiple scenarios in a
  single `test(...)`.
- Keep test output free of stray logging. When a log is part of the tested
  contract, assert on the calls (prefer a stable first-argument tag plus
  `expect.any(Error)`; do not pin long prose). When the log is incidental,
  silence only the expected tags — a blanket `.mockImplementation(() => {})`
  can hide a real regression.

## Examples

### Tautological assertions

```ts
// Bad — matcher is `normalized === THE_CONSTANT`
expect(isResetMessage(resetMessageConstant)).toBe(true)
expect(exportedRetryDelaysMs).toEqual([100, 500, 1_500])
expect(windowsEqual(window, window)).toBe(true)

// Good — independent oracle or a real branch
expect(isResetMessage(resetMessageConstant.replace(/\.$/, ''))).toBe(true)
expect(retries).toEqual([{ attempt: 1, nextDelayMs: 100 }])
expect(windowsEqual(window, { ...window, end: window.end + 1 })).toBe(false)
```

### Absence assertions

```ts
// Bad — q is gone; nothing can show it again
expect(capabilityMap.old_write).toBeUndefined()
expect(html).not.toContain('old-aria-label')

// Good — state flip: present on one path, absent on the other
expect(adminMap.adminUserList).toBeTruthy()
expect(userMap.adminUserList).toBeUndefined()
```

### File cleanup with `Symbol.asyncDispose` and `await using`

```ts
import { writeFile, readFile, rm } from 'node:fs/promises'
import { test, expect } from 'vitest'

const createTempFile = async () => {
	const path = `/tmp/test-${crypto.randomUUID()}.txt`
	await writeFile(path, 'hello')

	return {
		path,
		[Symbol.asyncDispose]: async () => {
			await rm(path, { force: true }).catch(() => {
				// Cleanup should never fail the test.
			})
		},
	}
}

test('reads a temp file', async () => {
	await using tempFile = await createTempFile()
	const contents = await readFile(tempFile.path, 'utf8')
	expect(contents).toBe('hello')
})
```

### `Symbol.asyncDispose` with `await using`

```ts
import { createServer } from 'node:http'
import { test, expect } from 'vitest'

const createDisposableServer = async () => {
	const server = createServer((_request, response) => {
		response.end('ok')
	})
	await new Promise<void>((resolve) => server.listen(0, resolve))
	const address = server.address()
	if (!address || typeof address === 'string') {
		throw new Error('Failed to resolve test server port')
	}

	return {
		url: `http://localhost:${address.port}`,
		[Symbol.asyncDispose]: async () => {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) reject(error)
					else resolve()
				})
			})
		},
	}
}

test('fetches from a disposable server', async () => {
	await using server = await createDisposableServer()
	const response = await fetch(server.url)
	expect(await response.text()).toBe('ok')
})
```
