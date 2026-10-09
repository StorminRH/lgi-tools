export const CODEX_VIDEO_PROVIDER_IDS = ['youtube', 'twitch-video', 'twitch-clip'] as const;

export type CodexVideoProvider = (typeof CODEX_VIDEO_PROVIDER_IDS)[number];

export interface CodexVideoRef {
  readonly provider: CodexVideoProvider;
  readonly videoId: string;
}

interface ProviderSpec {
  readonly label: 'YouTube' | 'Twitch';
  readonly host: 'youtube.com' | 'twitch.tv';
  readonly id: RegExp;
  readonly embed: (id: string, parents: readonly string[]) => string;
  readonly thumbnail: ((id: string) => string) | null;
}

const parentQuery = (parents: readonly string[]) => parents.map((parent) => `&parent=${parent}`).join('');

export const CODEX_VIDEO_PROVIDERS = {
  youtube: {
    label: 'YouTube',
    host: 'youtube.com',
    id: /^[A-Za-z0-9_-]{11}$/,
    embed: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`,
    thumbnail: (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  },
  'twitch-video': {
    label: 'Twitch',
    host: 'twitch.tv',
    id: /^[0-9]{1,12}$/,
    embed: (id, parents) => `https://player.twitch.tv/?video=${id}${parentQuery(parents)}&autoplay=true`,
    thumbnail: null,
  },
  'twitch-clip': {
    label: 'Twitch',
    host: 'twitch.tv',
    id: /^[A-Za-z0-9_-]{1,100}$/,
    embed: (id, parents) => `https://clips.twitch.tv/embed?clip=${id}${parentQuery(parents)}&autoplay=true`,
    thumbnail: null,
  },
} as const satisfies Record<CodexVideoProvider, ProviderSpec>;

export function isCodexVideoRef(ref: { provider: string; videoId: string }): boolean {
  return Object.hasOwn(CODEX_VIDEO_PROVIDERS, ref.provider)
    && CODEX_VIDEO_PROVIDERS[ref.provider as CodexVideoProvider].id.test(ref.videoId);
}

const is = (host: string) => (hostname: string) => hostname === host;
const under = (host: string) => (hostname: string) => hostname === host || hostname.endsWith(`.${host}`);

type Matcher = {
  readonly host: (hostname: string) => boolean;
  readonly provider: CodexVideoProvider;
  readonly id: (url: URL, segments: readonly string[]) => string | null | undefined;
};

const MATCHERS: readonly Matcher[] = [
  { host: is('youtu.be'), provider: 'youtube', id: (_url, segments) => segments[0] },
  { host: under('youtube.com'), provider: 'youtube', id: (url) => (url.pathname === '/watch' ? url.searchParams.get('v') : null) },
  {
    host: under('youtube.com'),
    provider: 'youtube',
    id: (_url, segments) => (segments.length === 2 && (segments[0] === 'shorts' || segments[0] === 'embed') ? segments[1] : null),
  },
  {
    host: is('clips.twitch.tv'),
    provider: 'twitch-clip',
    id: (_url, segments) => (segments.length === 1 && segments[0] !== 'embed' ? segments[0] : null),
  },
  {
    host: under('twitch.tv'),
    provider: 'twitch-video',
    id: (_url, segments) => (segments.length === 2 && segments[0] === 'videos' ? segments[1] : null),
  },
  {
    host: under('twitch.tv'),
    provider: 'twitch-clip',
    id: (_url, segments) => (segments.length === 3 && segments[1] === 'clip' ? segments[2] : null),
  },
];

function parsedUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  if (!URL.canParse(candidate)) return null;
  const url = new URL(candidate);
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
}

export function parseCodexVideoUrl(input: string): CodexVideoRef | null {
  const url = parsedUrl(input);
  if (!url) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  for (const matcher of MATCHERS) {
    if (!matcher.host(url.hostname)) continue;
    const videoId = matcher.id(url, segments);
    if (videoId && isCodexVideoRef({ provider: matcher.provider, videoId })) return { provider: matcher.provider, videoId };
  }
  return null;
}

export interface CodexVideoEmbed {
  readonly label: (typeof CODEX_VIDEO_PROVIDERS)[CodexVideoProvider]['label'];
  readonly host: (typeof CODEX_VIDEO_PROVIDERS)[CodexVideoProvider]['host'];
  readonly embedSrc: string;
  readonly thumbnail: string | null;
}
