The native Playwright entry point is `e2e/probes.spec.ts`. Select journey IDs with `E2E_SCENARIOS`; an unset selection runs none of this portfolio. Mandatory route journeys remain in `e2e/smoke.spec.ts`.

For `atlas-automatic-jump`, supply `E2E_JUMP_EXPECTED_SHIP_MASS_KG` from an independently verified local SDE fixture for ship type 28606, and `E2E_JUMP_EXPECTED_REMAINING_MASS_LABEL` containing the complete expected `Remaining mass ...` readout after one C247 transit. Missing expectations block the journey before its actions. The probe checks the persisted observed mass and the exact readout on both clients; expectations must not be copied from that run.

This inventory records source migration, not successful browser execution. Every retained journey still requires its selected lane and run-owned prerequisites.

The complete [coverage mapping](../coverage.md) is generated from the executable registry.
