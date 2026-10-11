import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SecurityStatus, SystemWithSecurity } from './security-status';

describe('SecurityStatus', () => {
  it('shows the CCP-rounded security in its band colour', () => {
    expect(renderToStaticMarkup(createElement(SecurityStatus, { security: 0.43 }))).toBe(
      '<span class="text-sec-04">0.4</span>',
    );
    expect(renderToStaticMarkup(createElement(SecurityStatus, { security: 0.04 }))).toBe(
      '<span class="text-sec-01">0.1</span>',
    );
    expect(renderToStaticMarkup(createElement(SecurityStatus, { security: -0.99 }))).toBe(
      '<span class="text-sec-null">-1.0</span>',
    );
  });

  it('shows a muted dash when the security is unknown', () => {
    expect(renderToStaticMarkup(createElement(SecurityStatus, { security: null }))).toBe(
      '<span class="text-muted">—</span>',
    );
  });
});

describe('SystemWithSecurity', () => {
  it('names the system, then its coloured security', () => {
    expect(
      renderToStaticMarkup(createElement(SystemWithSecurity, { system: { name: 'Amamake', security: 0.4 } })),
    ).toBe('Amamake <span class="text-sec-04">0.4</span>');
    expect(
      renderToStaticMarkup(createElement(SystemWithSecurity, { system: { name: 'Unknown', security: null } })),
    ).toBe('Unknown <span class="text-muted">—</span>');
  });
});
