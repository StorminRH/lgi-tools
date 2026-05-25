// Single source of truth for the platform's tool surface. Consumed by
// NavTools (the in-header strip), the Tools search source, and any future
// place that needs to know "what tools does LGI.tools offer?".
//
// Adding a tool is one entry here — every consumer picks it up.

export type Tool = {
  label: string;
  abbr: string;        // 2-letter shrunk-state label (when search expands)
  href: string | null; // null = SOON, not yet navigable
  matchPrefix?: string;
  description?: string; // surfaced in the search dropdown's sub-text
};

export const TOOLS: Tool[] = [
  {
    label: 'Wormhole Sites',
    abbr: 'WH',
    href: '/sites',
    matchPrefix: '/sites',
    description: 'Live · /sites',
  },
  {
    label: 'Industry Planner',
    abbr: 'IP',
    href: null,
    description: 'Soon · Phase 3',
  },
  {
    label: 'Wormhole Roll Calc',
    abbr: 'WR',
    href: null,
    description: 'Soon · Backlog',
  },
];
