import { describe, expect, it } from 'vitest';
import { deriveActionRows } from './actions-view';

describe('deriveActionRows', () => {
  it('offers a feed check and an open queue when nothing is waiting', () => {
    const [statics, queue, access] = deriveActionRows({
      statics: { pendingVersion: null, servingVersion: '7' },
      queue: { due: 2, deadLettered: 0 },
    });
    expect(statics).toMatchObject({
      status: 'serving v7 · no review waiting',
      cta: 'Check feed',
      badge: null,
    });
    expect(queue).toMatchObject({ status: '0 dead-lettered · 2 due', cta: 'Open', badge: null });
    expect(access).toMatchObject({ href: '/settings/access', cta: 'Open' });
  });

  it('calls out a pending review and dead letters', () => {
    const [statics, queue] = deriveActionRows({
      statics: { pendingVersion: '8', servingVersion: '' },
      queue: { due: 0, deadLettered: 3 },
    });
    expect(statics).toMatchObject({
      status: 'v8 waiting · nothing promoted yet',
      cta: 'Review',
      badge: { label: 'review', tone: 'orange' },
    });
    expect(queue).toMatchObject({ cta: 'Retry jobs', badge: { label: '3', tone: 'red' } });
  });

  it('degrades each row whose source could not be read', () => {
    const [statics, queue] = deriveActionRows({ statics: null, queue: null });
    expect(statics).toMatchObject({ status: 'statics unavailable', cta: 'Open', badge: null });
    expect(queue).toMatchObject({ status: 'queue unavailable', cta: 'Open', badge: null });
  });
});
