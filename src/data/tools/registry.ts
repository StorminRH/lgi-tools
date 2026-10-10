import { sectionMatches } from '@/lib/section-path';

export type Tool = {
  label: string;
  abbr: string;
  href: string | null;
  matchPrefix?: string;
  /** Other route prefixes this nav item owns, so it stays lit on their pages. */
  alsoMatches?: readonly string[];
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
    alsoMatches: ['/jobs', '/structures'],
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
  if (pathname == null || !tool.matchPrefix) return false;
  return [tool.matchPrefix, ...(tool.alsoMatches ?? [])].some((prefix) => sectionMatches(pathname, prefix));
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
