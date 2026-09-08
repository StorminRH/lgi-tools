# End-to-end testing

Playwright Test owns browser acceptance. Keep the mandatory production suite
small. Add browser coverage when a critical outcome depends on the real browser,
auth cookies, multiple clients, or browser lifecycle. Use Vitest and database
tests for arithmetic, geometry, parsing and durable server behavior.

Keep related assertions in one coherent journey with shared setup and cleanup.
Split cases when setup or failure behavior is independent. A route check must
prove its exact URL, required principal and useful ready content. A visible
body, changed URL or quiet error shell is insufficient. Dragging must move the
intended object; collaboration must reach another client; access revocation
must remove another principal's rights.

Fixtures create run-owned data and distinct permission roles. Teardown checks
that owned records are absent, including after failures. Missing fixture data,
required backend or measurement support blocks the selected case. Never silently
replace required interactions with empty-state coverage.

The five explicit lanes are mandatory production, local mutation, deployed
read-only, development only and optional benchmarks. Optional lanes require
selected journey IDs. Hardware-sensitive measurements cannot gate production or
require paid CPU. Keep real interaction and reduced-motion outcomes in ordinary
browser coverage. Preserve historical unchanged-suite cost measurements.

Prefer accessible locators and retrying observable assertions. Register shared
diagnostics before navigation on every client. Expected network failures must
name the exact endpoint, method and status within the scenario. Whole-test
retries are disabled for acceptance.

Auth storage, cookies, headers and raw network/DOM captures are not uploadable
evidence. Keep sanitized failure diagnostics under
`docs/ux-check/captures/sanitized-failures/` and the result inventory. A clean
report means `READY_FOR_REVIEW`; operator visual approval is separate. Browser
commands are not part of `pnpm verify` and must be reported separately.

Commands, prerequisite variables, selection and evidence policy are documented
in [selected browser acceptance](../ux-check/README.md).
