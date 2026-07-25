import { describe, expect, it } from 'vitest';
import {
  layoutZoneMap,
  zoneCells,
  zoneLabels,
  zoneLegend,
  zoneMapGraph,
  zoneOrder,
  type ZoneMapGraph,
} from './zone-map-geometry';

// A tiny stand-in graph with the same shape as the generated one: three layers, one
// reference-core exception, and one carve-out. Small enough that every coordinate can
// be checked by hand.
const graph: ZoneMapGraph = {
  nodes: [
    { id: 'api', label: 'api', layer: 2, kind: 'zone' },
    { id: 'app', label: 'app', layer: 3, kind: 'zone' },
    { id: 'data', label: 'data', layer: 1, kind: 'group' },
    { id: 'lib', label: 'lib', layer: 0, kind: 'zone' },
    { id: 'data__eve_data', label: 'data/eve-data', layer: 0, kind: 'reference-core' },
  ],
  edges: [
    { from: 'app', to: 'data', kind: 'allow' },
    { from: 'api', to: 'lib', kind: 'allow' },
    { from: 'data', to: 'data__eve_data', kind: 'exception' },
    { from: 'api', to: 'app', kind: 'carve-out' },
  ],
};

describe('zoneOrder', () => {
  it('orders both axes by layer descending', () => {
    expect(zoneOrder(graph)).toEqual(['app', 'api', 'data', 'lib', 'data__eve_data']);
  });

  it('keeps declaration order as the tiebreak within a layer', () => {
    // lib and data/eve-data share layer 0 and keep their generated order.
    expect(zoneOrder(graph).slice(3)).toEqual(['lib', 'data__eve_data']);
  });
});

describe('zoneCells', () => {
  it('places a cell at the row of the importer and the column of the target', () => {
    const cells = zoneCells(graph);
    const appData = cells.find((cell) => cell.from === 'app' && cell.to === 'data');
    // app is row 0, data is column 2, on a 148 origin with an 18px pitch.
    expect(appData).toEqual({ from: 'app', to: 'data', kind: 'allow', x: 148 + 2 * 18, y: 148 });
  });

  it('carries the exception class through as its own cell kind', () => {
    expect(zoneCells(graph).filter((cell) => cell.kind === 'exception')).toEqual([
      { from: 'data', to: 'data__eve_data', kind: 'exception', x: 148 + 4 * 18, y: 148 + 2 * 18 },
    ]);
  });

  it('excludes carve-outs, which are precedence rather than permission', () => {
    expect(zoneCells(graph)).toHaveLength(3);
    expect(zoneCells(graph).some((cell) => cell.to === 'app')).toBe(false);
  });

  it('puts every cell strictly above the diagonal, so the map reads as acyclic', () => {
    const order = zoneOrder(graph);
    for (const cell of zoneCells(graph)) {
      expect(order.indexOf(cell.to)).toBeGreaterThan(order.indexOf(cell.from));
    }
  });
});

describe('zoneLabels', () => {
  it('right-aligns row labels against the grid and centres them on the row', () => {
    const { rowLabels } = zoneLabels(graph);
    expect(rowLabels[0]).toEqual({ id: 'app', label: 'app', x: 140, y: 148 + 9 });
  });

  it('centres column labels on the column, above the grid', () => {
    const { columnLabels } = zoneLabels(graph);
    expect(columnLabels[1]).toEqual({ id: 'api', label: 'api', x: 148 + 18 + 9, y: 140 });
  });

  it('marks the carved-out row beside its measured label width', () => {
    const { carveOutMarkers } = zoneLabels(graph);
    // 'api' is 3 mono characters wide at 6px each, left of the label's right edge.
    expect(carveOutMarkers).toEqual([
      { id: 'api', over: 'app', x: 140 - 18 - 9, y: 148 + 18 + 9 },
    ]);
  });
});

describe('zoneLegend', () => {
  it('reads allow, exception, carve-out, then the deny-by-default rule', () => {
    expect(zoneLegend(graph).map((entry) => entry.kind)).toEqual([
      'allow',
      'exception',
      'carve-out',
      'forbidden',
    ]);
  });

  it('states that an empty cell is forbidden', () => {
    const forbidden = zoneLegend(graph).find((entry) => entry.kind === 'forbidden');
    expect(forbidden?.label).toMatch(/deny-by-default/);
  });

  it('stacks the rows below the grid', () => {
    const ys = zoneLegend(graph).map((entry) => entry.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(ys[0]).toBeGreaterThan(148 + graph.nodes.length * 18);
  });
});

describe('layoutZoneMap', () => {
  it('sizes the canvas around the grid, the labels, and the legend', () => {
    const layout = layoutZoneMap(graph);
    expect(layout.width).toBe(148 + 5 * 18 + 4);
    expect(layout.height).toBe(148 + 5 * 18 + 30 + 4 * 18);
  });

  it('draws one grid line per boundary on each axis', () => {
    expect(layoutZoneMap(graph).gridLines).toEqual([0, 18, 36, 54, 72, 90]);
  });

  it('spans the diagonal corner to corner across the grid', () => {
    expect(layoutZoneMap(graph).diagonal).toEqual({ x1: 148, y1: 148, x2: 238, y2: 238 });
  });

  it('centres the lit square inside its cell', () => {
    const layout = layoutZoneMap(graph);
    expect(layout.litInset * 2 + layout.litSize).toBe(layout.pitch);
  });
});

describe('layoutZoneMap — the committed generated graph', () => {
  const layout = layoutZoneMap(zoneMapGraph);

  it('lays out every zone and every declared permission', () => {
    expect(layout.order).toHaveLength(23);
    expect(layout.cells).toHaveLength(108);
    expect(layout.rowLabels).toHaveLength(23);
    expect(layout.columnLabels).toHaveLength(23);
  });

  it('keeps the live graph triangular — the acyclicity the map claims', () => {
    for (const cell of layout.cells) {
      expect(layout.order.indexOf(cell.to)).toBeGreaterThan(layout.order.indexOf(cell.from));
    }
  });

  it('marks the api row as the one first-match carve-out', () => {
    expect(layout.carveOutMarkers.map((marker) => [marker.id, marker.over])).toEqual([
      ['api', 'app'],
    ]);
  });

  it('keeps every label inside the gutter the layout reserves for it', () => {
    for (const row of layout.rowLabels) {
      expect(row.label.length * 6).toBeLessThan(layout.gridX);
    }
  });
});
