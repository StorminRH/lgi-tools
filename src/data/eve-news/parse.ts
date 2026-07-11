// Tiny RSS 2.0 parser for CCP's EVE Online news feed. A curated parser for a
// known feed is the right pairing (same call as the changelog parser): the feed
// is plain `<item>` blocks with `<title>`, `<link>`, `<pubDate>`, `<category>`,
// and we only surface title / date / category, so a full XML dependency would
// be dead weight. On unparseable input this THROWS so the caller can fail loudly
// (see the cached accessor's stale-while-revalidate contract).

import type { EveNewsItem } from './types';

const ITEM_RE = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

function firstTag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m?.[1]?.trim() ?? null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeOnce(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    const key = body.toLowerCase();
    const named = NAMED_ENTITIES[key];
    if (named !== undefined) return named;
    if (key.startsWith('#')) {
      const code = key.startsWith('#x')
        ? Number.parseInt(key.slice(2), 16)
        : Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

// CCP's feed double-encodes some text (e.g. `&amp;#39;` for an apostrophe). Two
// bounded passes resolve both single- and double-encoded entities. The result is
// rendered as a JSX text child, which React re-escapes, so decoding is purely for
// readability and never a markup-injection path.
function decodeEntities(s: string): string {
  return decodeOnce(decodeOnce(s));
}

function cleanText(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function toIso(pubDate: string | null): string | null {
  if (pubDate == null) return null;
  const ms = Date.parse(pubDate);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function parseEveRss(xml: string): EveNewsItem[] {
  if (typeof xml !== 'string' || !xml.includes('<item')) {
    throw new Error('eve rss: no <item> elements');
  }

  const items: EveNewsItem[] = [];
  for (const match of xml.matchAll(ITEM_RE)) {
    // ITEM_RE's capture group ([\s\S]*?) always participates, so match[1] is a string.
    const block = match[1] ?? '';
    const title = firstTag(block, 'title');
    const link = firstTag(block, 'link');
    if (!title || !link) continue;
    const url = cleanText(link);
    // Only surface http(s) links. These become anchor hrefs, and React does not
    // block a `javascript:`/`data:` href in production, so a malformed or
    // compromised feed entry must not be able to yield a script link.
    if (!/^https?:\/\//i.test(url)) continue;
    const category = firstTag(block, 'category');
    items.push({
      title: cleanText(title),
      url,
      publishedAt: toIso(firstTag(block, 'pubDate')),
      category: category ? cleanText(category) : null,
    });
  }

  if (items.length === 0) throw new Error('eve rss: parsed zero items');
  return items;
}
