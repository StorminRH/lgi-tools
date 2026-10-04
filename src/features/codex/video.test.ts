import { describe, expect, test } from 'vitest';
import { isCodexVideoRef, parseCodexVideoUrl } from './video';
import { codexVideoEmbed } from './video-embed';

const YOUTUBE = { provider: 'youtube', videoId: 'dQw4w9WgXcQ' } as const;
const TWITCH_VIDEO = { provider: 'twitch-video', videoId: '2245678901' } as const;
const TWITCH_CLIP = { provider: 'twitch-clip', videoId: 'AwkwardSalamander-abc_123' } as const;

const ACCEPTED: readonly [string, typeof YOUTUBE | typeof TWITCH_VIDEO | typeof TWITCH_CLIP][] = [
  ['https://youtu.be/dQw4w9WgXcQ', YOUTUBE],
  ['https://youtu.be/dQw4w9WgXcQ?t=43', YOUTUBE],
  ['https://youtu.be/dQw4w9WgXcQ/', YOUTUBE],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx', YOUTUBE],
  ['https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ', YOUTUBE],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', YOUTUBE],
  ['https://www.youtube.com/embed/dQw4w9WgXcQ', YOUTUBE],
  ['  youtube.com/watch?v=dQw4w9WgXcQ  ', YOUTUBE],
  ['http://youtu.be/dQw4w9WgXcQ', YOUTUBE],
  ['https://www.twitch.tv/videos/2245678901?t=1h2m', TWITCH_VIDEO],
  ['https://m.twitch.tv/videos/2245678901', TWITCH_VIDEO],
  ['https://clips.twitch.tv/AwkwardSalamander-abc_123', TWITCH_CLIP],
  ['https://www.twitch.tv/stormin/clip/AwkwardSalamander-abc_123?filter=clips', TWITCH_CLIP],
];

describe('parseCodexVideoUrl', () => {
  test.each(ACCEPTED)('reads %s as a provider and id', (url, expected) => {
    expect(parseCodexVideoUrl(url)).toEqual(expected);
  });

  test.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/playlist?list=PLx',
    'https://www.youtube.com/@fenris',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://youtu.be/',
    'https://youtu.be/dQw4w9 gXcQ',
    'https://www.twitch.tv/stormin',
    'https://www.twitch.tv/videos/v123',
    'https://www.twitch.tv/videos/1234567890123',
    'https://clips.twitch.tv/embed?clip=Slug',
    'https://player.twitch.tv/?video=123',
    'javascript:alert(1)',
    'ftp://youtu.be/dQw4w9WgXcQ',
    'not a url',
    '',
  ])('rejects %j', (url) => {
    expect(parseCodexVideoUrl(url)).toBeNull();
  });
});

test('a stored ref must fit its provider', () => {
  expect(isCodexVideoRef(YOUTUBE)).toBe(true);
  expect(isCodexVideoRef({ provider: 'youtube', videoId: 'https://youtu.be/dQw4w9WgXcQ' })).toBe(false);
  expect(isCodexVideoRef({ provider: 'twitch-video', videoId: 'abc' })).toBe(false);
  expect(isCodexVideoRef({ provider: 'twitch-clip', videoId: 'Slug/../x' })).toBe(false);
  expect(isCodexVideoRef({ provider: 'vimeo', videoId: '1' })).toBe(false);
});

test('every accepted link embeds from a host the page lets frames load', () => {
  const frameOrigins = ['https://www.youtube-nocookie.com/', 'https://player.twitch.tv/', 'https://clips.twitch.tv/'];
  for (const [url] of ACCEPTED) {
    const { embedSrc } = codexVideoEmbed(parseCodexVideoUrl(url)!, ['lgi.tools']);
    expect(frameOrigins.some((origin) => embedSrc.startsWith(origin)), url).toBe(true);
  }
});
