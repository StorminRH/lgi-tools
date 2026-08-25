// Regenerates the committed architecture-map artifact from the live Fallow
// boundary configuration. Every decision lives in the import-safe sibling module;
// this entry file is a thin read → build → write, like the other scripts here.
//
// Run:
//   pnpm generate:architecture-map
//
// The output is checked in. `src/scripts/architecture-map.test.ts` byte-compares
// the mermaid file against a fresh run, so forgetting to regenerate after a
// boundary change fails `pnpm verify` rather than publishing a stale map.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  ARCHITECTURE_MAP_ARTIFACTS,
  buildArchitectureMap,
  renderMermaid,
} from './architecture-map';

const map = buildArchitectureMap(
  JSON.parse(readFileSync(ARCHITECTURE_MAP_ARTIFACTS.config, 'utf8')),
);

writeFileSync(ARCHITECTURE_MAP_ARTIFACTS.mermaid, renderMermaid(map), 'utf8');

console.log(
  `architecture-map: ${map.nodes.length} zones, ${map.edges.length} relations → ` +
    `${ARCHITECTURE_MAP_ARTIFACTS.mermaid}`,
);
