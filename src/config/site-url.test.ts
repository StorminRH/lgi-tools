import { describe, expect, it } from 'vitest';
import { PRODUCTION_SITE_URL } from './site-url';

describe('durable site origins', () => {
  it('keeps production on the public host', () => {
    expect(PRODUCTION_SITE_URL).toBe('https://lgi.tools');
  });
});
