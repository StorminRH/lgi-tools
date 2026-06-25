import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccessGate } from './access-gate';

// Server-rendered markup assertions (the house pattern — SitesFilterLayout.test
// .ts): effects don't run, so the output captures exactly which branch the gate
// renders. The load-bearing guarantee is that the blocked branch withholds the
// gated children entirely, so no data leaks into the page.
function markup(props: Parameters<typeof AccessGate>[0]) {
  return renderToStaticMarkup(createElement(AccessGate, props));
}

describe('AccessGate', () => {
  it('renders the children and nothing else when access is granted', () => {
    const html = markup({
      blocked: false,
      reason: 'WHY-REASON',
      action: createElement('button', null, 'GRANT-ACTION'),
      children: 'GATED-DATA',
    });
    expect(html).toContain('GATED-DATA');
    expect(html).not.toContain('WHY-REASON');
    expect(html).not.toContain('GRANT-ACTION');
  });

  it('blocks with the reason + action and withholds the children when access is missing', () => {
    const html = markup({
      blocked: true,
      reason: 'WHY-REASON',
      action: createElement('button', null, 'GRANT-ACTION'),
      children: 'GATED-DATA',
    });
    expect(html).toContain('WHY-REASON');
    expect(html).toContain('GRANT-ACTION');
    // The gated children must not render — the blocked state shows none of the data.
    expect(html).not.toContain('GATED-DATA');
  });

  it('defaults the block to the orange tone and honours an explicit tone', () => {
    const base = { blocked: true, reason: 'r', action: null, children: 'GATED-DATA' } as const;
    expect(markup({ ...base })).toContain('text-tone-orange');
    expect(markup({ ...base, tone: 'red' })).toContain('text-pill-red-text');
  });
});
