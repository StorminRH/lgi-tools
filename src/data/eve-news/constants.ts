// EVE Online's public news feed. CCP's documented JSON feed
// (https://www.eveonline.com/rss/json/news) is unreliable — it was answering
// HTTP 500 (ArgumentNullException) when this was wired — so we read the stable
// RSS 2.0 XML feed and parse it ourselves.
export const EVE_NEWS_RSS_URL = 'https://www.eveonline.com/rss';

// How many of the feed's items to surface on the home dashboard.
export const EVE_NEWS_LIMIT = 5;

// Revalidation tag for the cached feed snapshot. Time-based `cacheLife('hours')`
// drives the refresh; this tag is here only as an optional manual bust hook
// (there is no cron for news).
export const EVE_NEWS_TAG = 'eve-news';
