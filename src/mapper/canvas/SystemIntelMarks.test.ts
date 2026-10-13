import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  writes: [] as (readonly [string, string])[],
  marks: [] as string[],
  pilots: null as { pilots: unknown[] } | null,
}));

vi.mock('@/components/ui/use-style-ref', () => ({
  useStyleProperty: (name: string, value: string) => {
    h.writes.push([name, value]);
    return undefined;
  },
}));
vi.mock('../signatures/use-glance-mark-index', () => ({ useGlanceMarks: () => h.marks }));
vi.mock('../tracking/presence-context', () => ({ useSystemPresence: () => h.pilots }));

import { SystemIntelMarks } from './SystemIntelMarks';

function markup(): string {
  return renderToStaticMarkup(createElement(SystemIntelMarks, { systemId: 31000001 }));
}

test('seats glance marks as labelled images and the pilot badge last, each placed around the disc', () => {
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

  expect(h.writes).toHaveLength(3);
  expect(h.writes[0]).toEqual(['--node-widget-seat-transform', 'translate(-50%, -50%) translate(38.5px, 0px)']);
  expect(h.writes[2]).toEqual(['--node-widget-seat-transform', 'translate(-50%, -50%) translate(0px, 38.5px)']);

  // No marks and no pilots: an empty track.
  h.writes.length = 0;
  h.marks = [];
  h.pilots = null;
  expect(markup()).not.toContain('data-chain-node-widget-seat');
  expect(h.writes).toEqual([]);
  h.marks = ['harvestables'];
  expect(markup()).toContain('aria-label="Harvestables"');
});
