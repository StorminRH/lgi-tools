import { describe, expect, it } from 'vitest';
import { parseEveRss } from './parse';

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
  <title>EVE Online feeds</title>
  <link>https://www.eveonline.com/news</link>
  <item>
    <title>Community Beat for 19 June</title>
    <link>https://www.eveonline.com/news/view/community-beat-for-19-june</link>
    <description>&lt;p&gt;Hello let&amp;#39;s go&lt;/p&gt;</description>
    <category>community</category>
    <category>offers</category>
    <pubDate>Fri, 19 Jun 2026 15:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Gallente Federation Day Gift &amp; Special Offers</title>
    <link>https://www.eveonline.com/news/view/gallente-day</link>
    <pubDate>Fri, 19 Jun 2026 11:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe('parseEveRss', () => {
  it('extracts title, link, category, and ISO pubDate', () => {
    const items = parseEveRss(FEED);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'Community Beat for 19 June',
      url: 'https://www.eveonline.com/news/view/community-beat-for-19-june',
      publishedAt: '2026-06-19T15:00:00.000Z',
      category: 'community',
    });
  });

  it('takes the first category when an item has several', () => {
    expect(parseEveRss(FEED)[0]!.category).toBe('community');
  });

  it('decodes single-encoded entities in titles', () => {
    expect(parseEveRss(FEED)[1]!.title).toBe('Gallente Federation Day Gift & Special Offers');
  });

  it('decodes CCP double-encoded entities (&amp;#39; -> apostrophe)', () => {
    const xml = `<rss><channel><item>
      <title>Patch Notes &amp;#39;26</title>
      <link>https://www.eveonline.com/news/view/patch</link>
    </item></channel></rss>`;
    expect(parseEveRss(xml)[0]!.title).toBe("Patch Notes '26");
  });

  it('skips items missing a title or link', () => {
    const xml = `<rss><channel>
      <item><link>https://x/a</link></item>
      <item><title>Has both</title><link>https://x/b</link></item>
    </channel></rss>`;
    const items = parseEveRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Has both');
  });

  it('leaves publishedAt null for an unparseable date', () => {
    const xml = `<rss><channel><item>
      <title>No date</title><link>https://x/c</link><pubDate>not a date</pubDate>
    </item></channel></rss>`;
    expect(parseEveRss(xml)[0]!.publishedAt).toBeNull();
  });

  it('throws on input with no items', () => {
    expect(() => parseEveRss('<rss><channel></channel></rss>')).toThrow();
    expect(() => parseEveRss('garbage')).toThrow();
  });

  it('skips items whose link is not an http(s) URL', () => {
    const xml = `<rss><channel>
      <item><title>Bad</title><link>javascript:alert(1)</link></item>
      <item><title>Good</title><link>https://www.eveonline.com/news/view/ok</link></item>
    </channel></rss>`;
    const items = parseEveRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Good');
    expect(items[0]!.url).toBe('https://www.eveonline.com/news/view/ok');
  });
});
