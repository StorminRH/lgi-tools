import { connection } from 'next/server';
import { readEnv } from '@/lib/env';
import { bearerMatches } from '@/lib/service-auth';

// Shared Vercel-cron entry guard. Every cron route defers to request time (so
// Cache Components doesn't try to prerender it) and accepts only Vercel's cron
// invoker, which sends `Authorization: Bearer ${CRON_SECRET}`. Returns an error
// Response to short-circuit the handler — 500 if the secret is unset, 401 for a
// bad/absent bearer — or null to proceed. One implementation means the auth
// check can't silently drift between routes.
export async function requireCronAuth(req: Request): Promise<Response | null> {
  await connection();
  const secret = readEnv('CRON_SECRET');
  if (!secret) {
    return new Response('CRON_SECRET not configured', { status: 500 });
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

// Awaits a fire-and-forget side effect, swallowing failures so observability
// can never break the cron, and awaiting so the write lands before the
// serverless function freezes on return.
export async function swallow(label: string, p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err) {
    console.error(label, err);
  }
}
