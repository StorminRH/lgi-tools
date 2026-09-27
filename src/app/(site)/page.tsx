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
import { buildDemoBoard, demoVariant } from '@/composition/board/demo-board';
import { readEnv } from '@/lib/env';
import { buildPageMetadata } from '@/lib/page-metadata';

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

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  state_mismatch:
    'Sign-in could not be verified. Try clicking "Log in with EVE" again.',
  token_exchange_failed:
    'EVE rejected the sign-in. Wait a moment and try again.',
  db_write_failed:
    'We signed you in but could not save your character record. Try again or report this.',
  admin_required:
    'The admin dashboard is only available to authorized characters.',
};

async function AuthErrorNotice({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawError = params.auth_error;
  const errorKey =
    typeof rawError === 'string' && rawError in AUTH_ERROR_MESSAGES ? rawError : null;
  if (!errorKey) return null;
  return (
    <div className="w-full max-w-[640px] mb-8">
      <Callout label="Auth">{AUTH_ERROR_MESSAGES[errorKey]}</Callout>
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
