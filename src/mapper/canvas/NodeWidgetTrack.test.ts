import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TrackOccupant } from './node-chrome';
import { NodeWidgetTrack } from './NodeWidgetTrack';

const GAS_OCCUPANT: TrackOccupant = {
  token: { glyph: 'gas-cloud', tone: 'teal', info: { kind: 'bare' } },
  probe: { kind: 'glance', bucket: 'harvestables' },
};

const COMBAT_OCCUPANT: TrackOccupant = {
  token: { glyph: 'combat-reticle', tone: 'red', info: { kind: 'bare' } },
  probe: { kind: 'glance', bucket: 'combat' },
};

describe('NodeWidgetTrack', () => {
  it('paints sprite-backed occupants with the official image', () => {
    const html = renderToStaticMarkup(
      createElement(NodeWidgetTrack, { occupants: [GAS_OCCUPANT] }),
    );
    expect(html).toContain('data-glance-mark="harvestables"');
    expect(html).toContain('size-icon-sm');
    expect(html).toContain('<img');
    expect(html).toContain('src="/eve/gas-scanned.png"');
    expect(html).toContain('alt="Gas"');
    expect(html).not.toContain('<svg');
  });

  it('paints vector occupants through NodeMark', () => {
    const html = renderToStaticMarkup(
      createElement(NodeWidgetTrack, { occupants: [COMBAT_OCCUPANT] }),
    );
    expect(html).toContain('data-glance-mark="combat"');
    expect(html).toContain('<svg');
    expect(html).not.toContain('<img');
  });
});
