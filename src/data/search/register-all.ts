// Imports every search source for its side-effect registration. Imported
// once at app boot via AppHeader (which is async and renders on every
// route), so by the time GlobalSearch dispatches a query the source list
// is fully populated.
//
// Registration order in this file determines the dropdown section order:
// Recent first (when present), then Sites, Tools, Commands.

import '@/features/search-recents/search';
import '@/features/wormhole-sites/search';
import '@/data/tools/search';
import '@/data/commands/search';
