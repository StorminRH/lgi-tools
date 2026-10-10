import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { withHostNumberLocale } from '@/lib/__tests__/host-locale';
import { siteWave } from '../__tests__/site-fixtures';
import { WaveCard } from './WaveCard';

test('wave DPS groups in en-US under any host locale, like the site card header', () => {
  const markup = withHostNumberLocale('de-DE', () =>
    renderToStaticMarkup(
      createElement(WaveCard, { wave: siteWave({ waveLabel: 'Wave 2', dpsTotal: 1500 }) }),
    ),
  );
  expect(markup).toContain('Wave 2');
  expect(markup).toContain('DPS 1,500</span>');
});
