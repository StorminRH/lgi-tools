import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { jobImage } from '@/data/eve-data/type-images';
import { JobRowFrame } from './JobRowFrame';

describe('JobRowFrame', () => {
  it('keeps the job identity and runner footer inside one aligned padded frame', () => {
    const html = renderToStaticMarkup(
      createElement(JobRowFrame, {
        headlineName: 'Scourge Heavy Missile',
        icon: jobImage(1, 209, 165),
        runs: 10,
        activityLabel: 'Manufacturing',
        remainingLabel: 'done in 1h',
        meta: { label: 'Active', tone: 'blue' },
        showBar: true,
        pct: 50,
        footer: createElement('span', null, 'Runner'),
      }),
    );

    expect(html).toContain('border-t border-border-soft px-3.5 py-[6px]');
    expect(html).toContain('border-t-0 px-0 py-0 hover:bg-transparent');
    expect(html).toContain('Runner');
  });
});
