// The one sanctioned door from src/** into Convex's generated function
// references. The repo-root convex/ directory sits outside the boundary
// rules' classified layers (like src/db/), so this data slice re-exporting it
// keeps every consumer on a normal `@/data/convex` import instead of a deep
// relative path into generated code.
export { api } from '../../../convex/_generated/api';
