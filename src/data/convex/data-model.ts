// Sanctioned door from src/** into Convex document and id types — mirrors
// `./api.ts` so consumers never deep-import `convex/_generated`.
export type { Doc, Id } from '../../../convex/_generated/dataModel';
