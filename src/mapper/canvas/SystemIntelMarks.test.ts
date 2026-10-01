import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  seat: { current: null as unknown },
  marks: [] as string[],
  pilots: null as { pilots: unknown[] } | null,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => h.seat,
  useLayoutEffect: (effect: () => void) => effect(),
}));
vi.mock('../signatures/use-glance-mark-index', () => ({ useGlanceMarks: () => h.marks }));
vi.mock('../tracking/presence-context', () => ({ useSystemPresence: () => h.pilots }));

import { SystemIntelMarks } from './SystemIntelMarks';

function markup(): string {
  return renderToStaticMarkup(createElement(SystemIntelMarks, { systemId: 31000001 }));
}

test('seats glance marks as labelled images and the pilot badge last, each placed around the disc', () => {
  const setProperty = vi.fn();
  h.seat.current = { style: { setProperty } };
  h.marks = ['combat', 'hacking'];
  h.pilots = { pilots: [{}, {}, {}] };

  const html = markup();
  expect(html).toContain('data-chain-node-widget-seat="0" role="img" aria-label="Combat" data-glance-mark="combat"');
  expect(html).toContain('data-chain-node-widget-seat="1" role="img" aria-label="Hacking" data-glance-mark="hacking"');
  const pilotSeat = html.slice(html.indexOf('data-chain-node-widget-seat="2"'));
  expect(pilotSeat).toMatch(/^data-chain-node-widget-seat="2" class=/);
  expect(pilotSeat).toContain('data-pilot-presence="live"');
  expect(pilotSeat).toContain('data-pilot-presence-count');
  expect(html.indexOf('data-glance-mark="hacking"')).toBeLessThan(html.indexOf('data-pilot-presence'));

  expect(setProperty).toHaveBeenCalledTimes(3);
  expect(setProperty).toHaveBeenNthCalledWith(1, '--node-widget-seat-transform', 'translate(-50%, -50%) translate(38.5px, 0px)');
  expect(setProperty).toHaveBeenNthCalledWith(3, '--node-widget-seat-transform', 'translate(-50%, -50%) translate(0px, 38.5px)');

  // No marks and no pilots: an empty track, and an unmounted seat is skipped.
  h.seat.current = null;
  h.marks = [];
  h.pilots = null;
  expect(markup()).not.toContain('data-chain-node-widget-seat');
  h.marks = ['harvestables'];
  expect(markup()).toContain('aria-label="Harvestables"');
});
