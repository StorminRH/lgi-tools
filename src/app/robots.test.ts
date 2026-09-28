import { expect, it } from 'vitest';
import robots from './robots';

it('keeps signed-in and admin surfaces out of crawlers', () => {
  expect(robots().rules).toEqual([
    { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/settings'] },
  ]);
});
