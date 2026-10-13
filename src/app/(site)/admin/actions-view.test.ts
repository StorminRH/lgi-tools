import { describe, expect, it } from 'vitest';
import { deriveActionRows } from './actions-view';

describe('deriveActionRows', () => {
  it('offers a feed check when nothing is waiting', () => {
    const [statics, access] = deriveActionRows({
      statics: { pendingVersion: null, servingVersion: '7' },
    });
    expect(statics).toMatchObject({
      status: 'serving v7 · no review waiting',
      cta: 'Check feed',
      badge: null,
    });
    expect(access).toMatchObject({ href: '/admin/users', cta: 'Open' });
  });

  it('calls out a pending review', () => {
    const [statics] = deriveActionRows({
      statics: { pendingVersion: '8', servingVersion: '' },
    });
    expect(statics).toMatchObject({
      status: 'v8 waiting · nothing promoted yet',
      cta: 'Review',
      badge: { label: 'review', tone: 'orange' },
    });
  });

  it('degrades the row whose source could not be read', () => {
    const [statics] = deriveActionRows({ statics: null });
    expect(statics).toMatchObject({ status: 'statics unavailable', cta: 'Open', badge: null });
  });
});
