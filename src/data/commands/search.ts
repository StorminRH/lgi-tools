// Commands search source. The platform's "command palette" surface — every
// action a user might fire from the keyboard ends up here. Session/admin
// gating keeps the list relevant: logged-out users see "Log in with EVE",
// logged-in users see "Log out", and admins additionally see "Open admin".
//
// Rows with side effects use `onSelect(router)` instead of `href`-driven
// navigation. Log out fires a fetch then a hard reload (drops cached
// server-component output that referenced the now-gone session); Log in
// hard-navigates to the OAuth endpoint (router.push can't reach the SSO
// redirect chain).

import type { AppRouterInstance, SearchContext, SearchResult, SearchSource } from '@/search';
import { fuzzyMatch } from '@/search/match';

type CommandEntry = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  iconText: string;
  onSelect?: (router: AppRouterInstance) => void;
  visible: (ctx: SearchContext) => boolean;
};

const COMMANDS: CommandEntry[] = [
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
    onSelect: () => {
      // Only redirect on success — if the POST fails (network drop, 4xx,
      // or 5xx) the server never cleared the session cookie, so landing
      // on / would silently look "logged out" while the session is still
      // active. fetch() only rejects on network errors, so `res.ok` is
      // the load-bearing check for HTTP-level failures.
      void fetch('/api/auth/logout', { method: 'POST' })
        .then((res) => {
          if (res.ok) window.location.href = '/';
          // else: server returned an error; stay put so the user can retry.
        })
        .catch(() => {
          // Network error; stay put.
        });
    },
    visible: (ctx) => ctx.session !== null,
  },
  {
    id: 'cmd:login',
    label: 'Log in with EVE',
    sub: 'Sign in via EVE SSO',
    href: '/api/auth/login',
    iconText: '↪',
    onSelect: () => {
      window.location.href = '/api/auth/login';
    },
    visible: (ctx) => ctx.session === null,
  },
];

export const commandsSearchSource: SearchSource = {
  name: 'Commands',
  limit: 5,
  async search(query, ctx) {
    const matched = COMMANDS
      .filter((c) => c.visible(ctx))
      .map((c) => ({ cmd: c, match: fuzzyMatch(query, c.label) }))
      .filter((row): row is { cmd: CommandEntry; match: NonNullable<typeof row.match> } => row.match !== null);

    matched.sort((a, b) => b.match.score - a.match.score);

    return matched.map<SearchResult>(({ cmd, match }) => ({
      kind: 'command',
      id: cmd.id,
      label: cmd.label,
      sub: cmd.sub,
      href: cmd.href,
      iconText: cmd.iconText,
      iconTone: 'cmd',
      matchIndices: match.matchIndices,
      onSelect: cmd.onSelect,
    }));
  },
};
