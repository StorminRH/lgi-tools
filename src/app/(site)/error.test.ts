import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import AtlasError from '@/app/(site)/atlas/error';
import SiteError from '@/app/(site)/error';

test('route error boundaries retry through Next and show the incident reference only when there is one', () => {
  const siteRetry = vi.fn();
  const site = SiteError({
    error: Object.assign(new Error('Render failed'), { digest: '2417785019' }),
    retry: siteRetry,
  });

  site.props.onRetry();
  expect(siteRetry).toHaveBeenCalledTimes(1);

  const siteMarkup = renderToStaticMarkup(site);
  expect(siteMarkup).toMatch(/<h1 [^>]*>Pod malfunction<\/h1>/);
  expect(siteMarkup).toContain('Incident');
  expect(siteMarkup).toContain('2417785019');
  expect(siteMarkup).toContain('>Try again</button>');
  expect(siteMarkup).toMatch(/<a [^>]*href="\/"[^>]*>Warp to home<\/a>/);
  expect(siteMarkup).not.toContain('<header');

  const atlasRetry = vi.fn();
  const atlas = AtlasError({ error: new Error('Map read failed'), retry: atlasRetry });

  atlas.props.onRetry();
  expect(atlasRetry).toHaveBeenCalledTimes(1);

  const atlasMarkup = renderToStaticMarkup(atlas);
  expect(atlasMarkup).toMatch(/<h1 [^>]*>Map unavailable<\/h1>/);
  expect(atlasMarkup).not.toContain('Incident');
  expect(atlasMarkup).toContain('>Try again</button>');
  expect(atlasMarkup).not.toContain('<header');
});
