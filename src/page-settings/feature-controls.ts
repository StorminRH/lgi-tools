/**
 * The feature-owned settings controls the presentation layer knows BY ID — the
 * ACCOUNT.6 growth of the control vocabulary beyond enum preferences. Each id
 * names a server-backed control whose data, gate, and mutation live entirely in
 * its owning slice; the settings page maps the id to that slice's component (an
 * exhaustive switch, so an unmapped id is a compile error). A dedicated value
 * module (not types.ts, which is contractually value-free; not controls.ts,
 * which types.ts would then cycle with) — the anti-drift gate audits spec refs
 * against this list.
 */
export const FEATURE_CONTROL_IDS = ['corp-structure-sharing'] as const;

/** Closed identifiers for feature-backed controls whose state is resolved above the participating slices. */
export type FeatureControlId = (typeof FEATURE_CONTROL_IDS)[number];
