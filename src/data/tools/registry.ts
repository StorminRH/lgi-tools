// Single source of truth for the platform's tool surface. Consumed by
// NavTools (the in-header strip), the Tools search source, and any future
// place that needs to know "what tools does LGI.tools offer?".
//
// Adding a tool is one entry here — every consumer picks it up.

export type Tool = {
  label: string;
  abbr: string;        // 2-letter glyph for the search-dropdown result icon
  href: string | null; // null = SOON, not yet navigable
  matchPrefix?: string;
  description?: string; // surfaced in the search dropdown's sub-text
  navDisabled?: boolean; // true = show in the header nav strip but don't link
                         // it; still reachable via search and direct URL
  navHidden?: boolean;   // true = omit from the header nav strip entirely;
                         // still reachable via search and direct URL
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
    href: '/industry',
    matchPrefix: '/industry',
    description: 'Live · /industry',
  },
  {
    label: 'Skill Queues',
    abbr: 'SQ',
    href: '/skills',
    matchPrefix: '/skills',
    description: 'Live · /skills',
    // Out of the header strip until the sitewide UX pass decides nav
    // placement; live via search and direct URL.
    navHidden: true,
  },
  {
    label: 'Industry Jobs',
    abbr: 'IJ',
    href: '/jobs',
    matchPrefix: '/jobs',
    description: 'Live · /jobs',
    // Out of the header strip until the sitewide UX pass decides nav
    // placement; live via search and direct URL.
    navHidden: true,
  },
  {
    label: 'Structures',
    abbr: 'ST',
    href: '/structures',
    matchPrefix: '/structures',
    description: 'Live · /structures',
    // Out of the header strip until the sitewide UX pass decides nav placement;
    // reachable via search, direct URL, and the planner's structure-selector link.
    navHidden: true,
  },
];

// The tools shown in the header navigation. Both the desktop strip (NavTools)
// and the mobile hamburger (NavMenu) iterate this one list, so adding a link is
// a single registry entry that appears in both at once.
export function visibleNavTools(): Tool[] {
  return TOOLS.filter((tool) => !tool.navHidden);
}

// Whether `tool` is the active page for the current pathname. Prefix-based, so a
// tool stays highlighted across its sub-routes (e.g. /sites/30002 → Wormhole
// Sites). `pathname` is null in the static shell before it streams in.
export function isToolActive(tool: Tool, pathname: string | null): boolean {
  return pathname != null && !!tool.matchPrefix && pathname.startsWith(tool.matchPrefix);
}

export type NavToolItem =
  | { kind: 'soon'; label: string; title: string }
  | { kind: 'link'; label: string; href: string; active: boolean; title: string };

// One header nav entry, derived once for both the desktop strip (NavTools) and
// the mobile hamburger (NavMenu): a non-navigable tool renders as an inert "soon"
// span (a null href reads "coming soon"); a live tool renders as a link with its
// active state resolved from the pathname.
export function deriveNavToolItem(tool: Tool, pathname: string | null): NavToolItem {
  if (tool.href === null || tool.navDisabled) {
    return {
      kind: 'soon',
      label: tool.label,
      title: tool.href === null ? `${tool.label} — coming soon` : tool.label,
    };
  }
  return {
    kind: 'link',
    label: tool.label,
    href: tool.href,
    active: isToolActive(tool, pathname),
    title: tool.label,
  };
}
