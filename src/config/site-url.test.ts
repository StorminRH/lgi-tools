import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SITE_URL,
  resolveSiteUrl,
  STAGING_SITE_URL,
} from './site-url';

describe('durable site origins', () => {
  it('keeps production on the public host', () => {
    expect(PRODUCTION_SITE_URL).toBe('https://lgi.tools');
  });

  it('pins staging to the standing Preview host', () => {
    expect(STAGING_SITE_URL).toBe('https://staging.lgi.tools');
  });
});

describe('resolveSiteUrl', () => {
  it('prefers an explicit NEXT_PUBLIC_SITE_URL', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://example.test',
        VERCEL_GIT_COMMIT_REF: 'staging',
      }),
    ).toBe('https://example.test');
  });

  it('falls back to the staging host on a staging Preview build', () => {
    expect(resolveSiteUrl({ VERCEL_GIT_COMMIT_REF: 'staging' })).toBe(
      STAGING_SITE_URL,
    );
    expect(resolveSiteUrl({ VERCEL_TARGET_ENV: 'staging' })).toBe(
      STAGING_SITE_URL,
    );
    expect(resolveSiteUrl({ LGI_PREVIEW_LINE: 'staging' })).toBe(
      STAGING_SITE_URL,
    );
  });

  it('falls back to production for main, development, and an empty env', () => {
    expect(resolveSiteUrl({ VERCEL_GIT_COMMIT_REF: 'main' })).toBe(
      PRODUCTION_SITE_URL,
    );
    expect(resolveSiteUrl({ VERCEL_GIT_COMMIT_REF: 'development' })).toBe(
      PRODUCTION_SITE_URL,
    );
    expect(resolveSiteUrl({})).toBe(PRODUCTION_SITE_URL);
  });
});
