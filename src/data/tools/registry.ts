export type Tool = {
  label: string;
  abbr: string;
  href: string | null;
  matchPrefix?: string;
  description?: string;
  navDisabled?: boolean;
  navHidden?: boolean;
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
    label: 'Atlas',
    abbr: 'AT',
    href: '/atlas',
    matchPrefix: '/atlas',
    description: 'Live · /atlas',
  },
  {
    label: 'Skill Queues',
    abbr: 'SQ',
    href: '/skills',
    matchPrefix: '/skills',
    description: 'Live · /skills',
    navHidden: true,
  },
  {
    label: 'Industry Jobs',
    abbr: 'IJ',
    href: '/jobs',
    matchPrefix: '/jobs',
    description: 'Live · /jobs',
    navHidden: true,
  },
  {
    label: 'Structures',
    abbr: 'ST',
    href: '/structures',
    matchPrefix: '/structures',
    description: 'Live · /structures',
    navHidden: true,
  },
];

export function visibleNavTools(): Tool[] {
  return TOOLS.filter((tool) => !tool.navHidden);
}

export function isToolActive(tool: Tool, pathname: string | null): boolean {
  return pathname != null && !!tool.matchPrefix && pathname.startsWith(tool.matchPrefix);
}

export type NavToolItem =
  | { kind: 'soon'; label: string; title: string }
  | { kind: 'link'; label: string; href: string; active: boolean; title: string };

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
