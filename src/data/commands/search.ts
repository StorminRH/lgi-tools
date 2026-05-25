// Commands search source. The platform's "command palette" surface — every
// action a user might fire from the keyboard ends up here. Session/admin
// gating keeps the list relevant: logged-out users see "Log in with EVE",
// logged-in users see "Log out", and admins additionally see "Open admin".

import { registerSearchSource } from '@/data/search';
import type { SearchContext, SearchResult } from '@/data/search';

type CommandEntry = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  iconText: string;
  command?: SearchResult['command'];
  visible: (ctx: SearchContext) => boolean;
};

const COMMANDS: CommandEntry[] = [
  {
    id: 'cmd:refresh-prices',
    label: 'Refresh prices',
    sub: 'Re-fetch the latest Jita 5%-percentile snapshot',
    href: '/sites',
    iconText: '⟳',
    command: 'refresh-prices',
    visible: () => true,
  },
  {
    id: 'cmd:open-changelog',
    label: 'Open changelog',
    sub: 'What\'s shipped recently',
    href: '/changelog',
    iconText: '→',
    visible: () => true,
  },
  {
    id: 'cmd:open-legal',
    label: 'Open legal',
    sub: 'EVE Online trademark + data we collect',
    href: '/legal',
    iconText: '→',
    visible: () => true,
  },
  {
    id: 'cmd:open-admin',
    label: 'Open admin',
    sub: 'Manage admins · view usage report',
    href: '/admin',
    iconText: '→',
    visible: (ctx) => ctx.isAdmin,
  },
  {
    id: 'cmd:logout',
    label: 'Log out',
    sub: 'End the current EVE session',
    href: '/api/auth/logout',
    iconText: '⏏',
    command: 'logout',
    visible: (ctx) => ctx.session !== null,
  },
  {
    id: 'cmd:login',
    label: 'Log in with EVE',
    sub: 'Sign in via EVE SSO',
    href: '/api/auth/login',
    iconText: '↪',
    command: 'login',
    visible: (ctx) => ctx.session === null,
  },
];

function matchRange(label: string, query: string): [number, number] | undefined {
  if (query.length === 0) return undefined;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return undefined;
  return [idx, idx + query.length];
}

registerSearchSource({
  name: 'Commands',
  limit: 5,
  async search(query, ctx) {
    const q = query.toLowerCase();
    return COMMANDS
      .filter((c) => c.visible(ctx))
      .filter((c) => c.label.toLowerCase().includes(q))
      .map<SearchResult>((c) => ({
        kind: 'command',
        id: c.id,
        label: c.label,
        sub: c.sub,
        href: c.href,
        iconText: c.iconText,
        iconTone: 'cmd',
        matchRange: matchRange(c.label, query),
        command: c.command ?? null,
      }));
  },
});
