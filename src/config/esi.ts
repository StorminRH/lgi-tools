// ESI request posture. The base URL is label-less (no /latest, /dev, /legacy);
// this reviewed date pins the API contract so a CCP-side `latest` bump can't
// silently reshape what we parse. Sent as a forced header on every ESI call
// (see src/lib/esi). Bump deliberately after re-verifying the orders
// response shape against a newer date.
export const ESI_COMPATIBILITY_DATE = '2025-08-26';
