import { Suspense } from 'react';
import { connection } from 'next/server';
import { BoardEmpty } from '@/components/composition/board/BoardEmpty';
import { BoardFrame } from '@/components/composition/board/BoardFrame';
import { HomeBoardView } from '@/components/composition/board/HomeBoardView';
import { HomeDashboard } from '@/components/composition/HomeDashboard';
import { JsonLd } from '@/components/composition/JsonLd';
import { Callout } from '@/components/ui/callout';
import { PageShell } from '@/components/ui/page-shell';
import { SITE_URL } from '@/config/site-url';
import { isAuthErrorCode, LINK_ERROR_MESSAGES } from '@/composition/auth-error';
import { buildDemoBoard, demoVariant } from '@/composition/board/demo-board';
import { readEnv } from '@/lib/env';
import { resolveNotice } from '@/lib/error-copy';
import { buildPageMetadata } from '@/lib/page-metadata';
import type { AuthErrorCode, BetterAuthLinkError, BetterAuthSignInError } from '@/platform/auth/api-contract';

export const metadata = buildPageMetadata({
  title: 'Eve Online Wormhole Site Database & Live Jita Loot Prices — LGI.tools',
  description:
    'Browse Eve Online wormhole sites by class, type, and ISK value, with live Jita prices on ore and gas resources. Free tools for wormhole pilots.',
  canonical: '/',
  absoluteTitle: true,
});

const HOME_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Lo-Gang Industries',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'LGI.tools',
      url: SITE_URL,
      description:
        'Eve Online tools for wormhole pilots — a searchable database of wormhole sites with live Jita loot prices.',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

const AUTH_ERROR_MESSAGES = {
  login_required: 'Log in with EVE to open your settings.',
  admin_required:
    'The admin dashboard is only available to authorized characters.',
} satisfies Record<AuthErrorCode, string>;

const SIGN_IN_ERROR_MESSAGES = {
  ...LINK_ERROR_MESSAGES,
  account_not_linked:
    "That character isn't linked to an account here any more. Try signing in again, or sign in with a character on your account and add it under Settings → Characters.",
} satisfies Record<BetterAuthSignInError | BetterAuthLinkError, string>;

/**
 * Any other `?error=` on the home page is a sign-in or link from here that did not finish (an
 * expired state cookie, EVE failing the code exchange, Better Auth's own error redirect). The code
 * is never shown: Better Auth only filters it to a word, and `error_description` is raw.
 */
const SIGN_IN_FAILED_MESSAGE = "Your EVE login didn't finish. Please try again.";

/** A page guard's `?auth_error=` notice, else the copy for a sign-in or link that came back with `?error=`. */
function authNotice(params: { [key: string]: string | string[] | undefined }): string | null {
  const code = params.auth_error;
  if (isAuthErrorCode(code)) return AUTH_ERROR_MESSAGES[code];
  return resolveNotice(params.error, SIGN_IN_ERROR_MESSAGES, SIGN_IN_FAILED_MESSAGE);
}

async function AuthErrorNotice({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const message = authNotice(await searchParams);
  if (message === null) return null;
  return (
    <div className="w-full max-w-[640px] mb-8">
      <Callout label="Auth">{message}</Callout>
    </div>
  );
}

async function requestNow(): Promise<number> {
  await connection();
  return Date.now();
}

async function BoardDemo({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const variant = demoVariant((await searchParams).demo);
  if (variant === null || readEnv('VERCEL_ENV') === 'production') return null;
  const now = await requestNow();
  const board = buildDemoBoard(now, variant);
  return (
    <BoardFrame demo>
      {board.characters.length === 0 ? <BoardEmpty /> : <HomeBoardView board={board} now={now} />}
    </BoardFrame>
  );
}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <PageShell mode="detail">
      <JsonLd data={HOME_JSON_LD} />
      <Suspense fallback={null}>
        <AuthErrorNotice searchParams={searchParams} />
      </Suspense>
      <HomeDashboard
        demoSlot={
          <Suspense fallback={null}>
            <BoardDemo searchParams={searchParams} />
          </Suspense>
        }
      />
    </PageShell>
  );
}
