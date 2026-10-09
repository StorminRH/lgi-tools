import { SITE_URL } from '@/config/site-url';
import { readEnv } from '@/lib/env';
import { CODEX_VIDEO_PROVIDERS, type CodexVideoEmbed, type CodexVideoRef } from './video';

export interface TwitchParentHosts {
  readonly siteUrl: string;
  readonly vercelUrl?: string;
  readonly vercelBranchUrl?: string;
  readonly development: boolean;
}

const deploymentHost = (host: string | undefined) => (host ? [new URL(`https://${host}`).hostname] : []);

export function twitchParents({ siteUrl, vercelUrl, vercelBranchUrl, development }: TwitchParentHosts): string[] {
  const hosts = [
    new URL(siteUrl).hostname,
    ...deploymentHost(vercelUrl),
    ...deploymentHost(vercelBranchUrl),
    ...(development ? ['localhost', '127.0.0.1'] : []),
  ];
  return [...new Set(hosts)];
}

const siteVideoParents = () =>
  twitchParents({
    siteUrl: SITE_URL,
    vercelUrl: readEnv('VERCEL_URL'),
    vercelBranchUrl: readEnv('VERCEL_BRANCH_URL'),
    development: process.env.NODE_ENV === 'development',
  });

export function codexVideoEmbed(ref: CodexVideoRef, parents: readonly string[] = siteVideoParents()): CodexVideoEmbed {
  const spec = CODEX_VIDEO_PROVIDERS[ref.provider];
  return {
    label: spec.label,
    host: spec.host,
    embedSrc: spec.embed(ref.videoId, parents),
    thumbnail: spec.thumbnail ? spec.thumbnail(ref.videoId) : null,
  };
}
