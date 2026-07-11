// Commands search source. The platform's "command palette" surface — every
// action a user might fire from the keyboard ends up here. Session/admin
// gating keeps the list relevant: logged-out users see "Log in with EVE",
// logged-in users see "Log out", and admins additionally see "Open admin".
//
// Rows with side effects use `onSelect(router)` instead of `href`-driven
// navigation. Log out POSTs Better Auth's sign-out then hard-reloads (drops
// cached server-component output that referenced the now-gone session); Log in
// POSTs Better Auth's OAuth sign-in for the SSO redirect URL and hard-navigates
// to it (router.push can't reach the cross-origin SSO chain).
//
// This is a data slice, so it can't import the auth feature's client — it talks
// to Better Auth's REST endpoints through the typed contracts on auth's shared
// surface (features/auth/api-contract.ts), whose shapes are pinned by the
// better-auth version in package.json.

import { signInOauth2Endpoint, signOutEndpoint } from '@/features/auth/api-contract';
import { apiFetch } from '@/lib/api-client';
import type { AppRouterInstance, SearchContext, SearchSource } from '@/search';
import { rankFuzzyResults } from '@/search/rank';

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
    sub: 'Dashboard · traffic, health, users',
    href: '/admin',
    iconText: '→',
    visible: (ctx) => ctx.isAdmin,
  },
  {
    id: 'cmd:open-access',
    label: 'Open admin access',
    sub: 'Manage admins · role change audit',
    href: '/admin/access',
    iconText: '→',
    visible: (ctx) => ctx.isAdmin,
  },
  {
    id: 'cmd:logout',
    label: 'Log out',
    sub: 'End the current EVE session',
    href: '/',
    iconText: '⏏',
    onSelect: () => {
      // Only redirect on success — if the POST fails (network drop, 4xx,
      // or 5xx) the server never cleared the session, so landing on / would
      // silently look "logged out" while the session is still active. apiFetch
      // only rejects on network errors, so `result.ok` is the load-bearing
      // check for HTTP-level failures.
      void apiFetch(signOutEndpoint, { body: {} })
        .then((result) => {
          if (result.ok) window.location.href = '/';
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
    href: '/',
    iconText: '↪',
    onSelect: () => {
      // Better Auth's OAuth sign-in is a POST returning the SSO redirect URL;
      // hard-navigate the browser to it. On any failure, stay put.
      void apiFetch(signInOauth2Endpoint, { body: { providerId: 'eve', callbackURL: '/' } })
        .then((result) => {
          if (result.ok && result.data.url) window.location.href = result.data.url;
        })
        .catch(() => {
          // Network error; stay put.
        });
    },
    visible: (ctx) => ctx.session === null,
  },
];

export const commandsSearchSource: SearchSource = {
  id: 'commands',
  name: 'Commands',
  limit: 5,
  async search(query, ctx) {
    return rankFuzzyResults(
      COMMANDS.filter((c) => c.visible(ctx)),
      query,
      (c) => c.label,
      (cmd, match) => ({
        kind: 'command',
        id: cmd.id,
        label: cmd.label,
        sub: cmd.sub,
        href: cmd.href,
        iconText: cmd.iconText,
        iconTone: 'cmd',
        matchIndices: match.matchIndices,
        onSelect: cmd.onSelect,
      }),
    );
  },
};
