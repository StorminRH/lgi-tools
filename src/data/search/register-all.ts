// Imports every search source for its side-effect registration. Imported
// once at app boot via AppHeader (which is async and renders on every
// route), so by the time GlobalSearch dispatches a query the source list
// is fully populated.
//
// Registration order in this file determines the dropdown section order:
// Recent first (when present), then Sites, Tools, Commands.

/* eslint-disable boundaries/dependencies --
 * Search-source wiring manifest: pure side-effect imports that register every
 * source (across both features and data slices) into the slice-agnostic
 * registry. This is composition that structurally belongs in a layer ABOVE the
 * slices (the pattern src/db/sde-pipeline.ts follows), but currently lives
 * inside the search slice, so it crosses the import-direction boundaries on
 * purpose. Relocating it above the data layer is a tracked follow-up (see
 * docs/SCRATCHPAD.md); until then this one wiring file is exempt.
 */
import '@/features/search-recents/search';
import '@/features/wormhole-sites/search';
import '@/features/industry-planner/search';
import '@/data/tools/search';
import '@/data/commands/search';
