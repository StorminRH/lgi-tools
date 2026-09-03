export const FEATURE_CONTROL_IDS = ['corp-structure-sharing'] as const;

export type FeatureControlId = (typeof FEATURE_CONTROL_IDS)[number];
