import { afterEach, describe, expect, test, vi } from 'vitest';
import { SITE_URL } from '@/config/site-url';
import { codexVideoEmbed, twitchParents } from './video-embed';

const YOUTUBE = { provider: 'youtube', videoId: 'dQw4w9WgXcQ' } as const;
const TWITCH_VIDEO = { provider: 'twitch-video', videoId: '2245678901' } as const;
const TWITCH_CLIP = { provider: 'twitch-clip', videoId: 'AwkwardSalamander-abc_123' } as const;

test('Twitch embeds name the site host, each Vercel deployment host, and the local hosts in development', () => {
  expect(twitchParents({ siteUrl: 'https://lgi.tools', development: false })).toEqual(['lgi.tools']);
  expect(twitchParents({ siteUrl: 'https://lgi.tools', development: true })).toEqual(['lgi.tools', 'localhost', '127.0.0.1']);
  expect(twitchParents({ siteUrl: 'http://localhost:3000', development: true })).toEqual(['localhost', '127.0.0.1']);
  expect(
    twitchParents({
      siteUrl: 'https://staging.lgi.tools',
      vercelUrl: 'lgi-tools-abc123-storminrh.vercel.app',
      vercelBranchUrl: 'lgi-tools-git-staging-storminrh.vercel.app',
      development: false,
    }),
  ).toEqual(['staging.lgi.tools', 'lgi-tools-abc123-storminrh.vercel.app', 'lgi-tools-git-staging-storminrh.vercel.app']);
  expect(
    twitchParents({ siteUrl: 'https://lgi.tools', vercelUrl: 'lgi-tools-abc123-storminrh.vercel.app', development: false }),
  ).toEqual(['lgi.tools', 'lgi-tools-abc123-storminrh.vercel.app']);
  expect(
    twitchParents({ siteUrl: 'https://lgi.tools', vercelUrl: 'lgi.tools', vercelBranchUrl: '', development: false }),
  ).toEqual(['lgi.tools']);
});

test('builds the privacy-mode YouTube embed and its thumbnail', () => {
  expect(codexVideoEmbed(YOUTUBE, ['lgi.tools'])).toEqual({
    label: 'YouTube',
    host: 'youtube.com',
    embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1',
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  });
});

test('builds Twitch embeds with one parent per host and no thumbnail', () => {
  expect(codexVideoEmbed(TWITCH_VIDEO, ['lgi.tools', 'localhost', '127.0.0.1'])).toEqual({
    label: 'Twitch',
    host: 'twitch.tv',
    embedSrc: 'https://player.twitch.tv/?video=2245678901&parent=lgi.tools&parent=localhost&parent=127.0.0.1&autoplay=true',
    thumbnail: null,
  });
  expect(codexVideoEmbed(TWITCH_CLIP, ['lgi.tools']).embedSrc).toBe(
    'https://clips.twitch.tv/embed?clip=AwkwardSalamander-abc_123&parent=lgi.tools&autoplay=true',
  );
});

describe('the page embed on a Vercel deployment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('names the site host and both deployment hosts as Twitch parents', () => {
    vi.stubEnv('VERCEL_URL', 'lgi-tools-abc123-storminrh.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', 'lgi-tools-git-staging-storminrh.vercel.app');

    expect(codexVideoEmbed(TWITCH_VIDEO).embedSrc).toBe(
      `https://player.twitch.tv/?video=2245678901&parent=${new URL(SITE_URL).hostname}` +
        '&parent=lgi-tools-abc123-storminrh.vercel.app&parent=lgi-tools-git-staging-storminrh.vercel.app&autoplay=true',
    );
  });
});
