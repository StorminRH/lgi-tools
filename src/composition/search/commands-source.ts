import { authClient } from '@/platform/auth/auth-client';
import { reloadDocumentHome } from '@/platform/auth/reload-document-home';
import type { AppRouterInstance, SearchContext, SearchSource } from '@/platform/search';
import { rankFuzzyResults } from '@/platform/search/rank';

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

      void authClient
        .signOut()
        .then(({ error }) => {
          if (!error) reloadDocumentHome();

        })
        .catch(() => {

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

      void authClient.signIn.oauth2({ providerId: 'eve', callbackURL: '/' }).catch(() => {

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

        iconTone: 'neutral',
        matchIndices: match.matchIndices,
        onSelect: cmd.onSelect,
      }),
    );
  },
};
