import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ItemNameStack, LedgerColumnHead } from './ledger-parts';

const HEAD =
  'tracking-optical text-eyebrow text-muted font-semibold mb-2 flex items-center gap-x-2 whitespace-nowrap';
const LEADER = 'h-0 flex-1 border-b border-dotted border-border-idle';

test('a column head shows its label, count and ISK total, and collapses only when asked', () => {
  const ledger = renderToStaticMarkup(
    createElement(LedgerColumnHead, { label: 'Minerals', count: 7, total: 2_350_000, pending: false }),
  );
  expect(ledger).toBe(
    `<div class="${HEAD}"><span class="flex items-center gap-2">Minerals<span class="text-faint">· 7</span></span>`
      + `<span class="${LEADER}"></span>`
      + '<span data-price-state="settled" class="price-live font-ui tabular-nums text-ui font-semibold tracking-normal text-isk">2.35M</span></div>',
  );
  expect(ledger).not.toContain('@max-[14rem]');

  const tier = renderToStaticMarkup(
    createElement(LedgerColumnHead, { label: 'Tier 2', count: 3, total: 1_500, pending: true, collapseNarrow: true }),
  );
  expect(tier).toContain(`<div class="${HEAD} @max-[14rem]:flex-col @max-[14rem]:items-start">`);
  expect(tier).toContain(`<span class="${LEADER} @max-[14rem]:hidden"></span>`);
  expect(tier).toContain('Tier 2<span class="text-faint">· 3</span>');
  expect(tier).toMatch(/<span data-price-state="pending" aria-busy="true" class="[^"]*price-pending[^"]*">1\.5K<\/span>/);
});

test('an item name stack clamps the name over a truncated label and merges the caller layout', () => {
  const plain = renderToStaticMarkup(
    createElement(ItemNameStack, { name: 'Tritanium', label: '4.20 / unit' }),
  );
  expect(plain).toBe(
    '<div class="flex min-w-0 flex-col gap-px">'
      + '<span class="line-clamp-2 break-words font-data text-ui font-medium leading-[1.28] text-name">Tritanium</span>'
      + '<span class="font-data tracking-normal text-small text-muted truncate">4.20 / unit</span></div>',
  );

  const placed = renderToStaticMarkup(
    createElement(ItemNameStack, {
      name: 'Fernite Carbide',
      label: 'Reaction',
      className: 'relative z-10 pointer-events-none [grid-area:name]',
    }),
  );
  expect(placed).toMatch(
    /^<div class="flex min-w-0 flex-col gap-px relative z-10 pointer-events-none \[grid-area:name\]"><span class="line-clamp-2 [^"]*">Fernite Carbide<\/span><span class="font-data [^"]* truncate">Reaction<\/span><\/div>$/,
  );
});
