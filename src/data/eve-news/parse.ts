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

    const block = match[1] ?? '';
    const title = firstTag(block, 'title');
    const link = firstTag(block, 'link');
    if (!title || !link) continue;
    const url = cleanText(link);

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
