// Pure layout for the devlog's zone map: turns the generated architecture graph into
// the coordinates of a permission matrix. Rows are importing zones, columns are the
// zones they may import, and both axes share one order — layer descending, with the
// generator's declaration order as the tiebreak.
//
// That single order is what makes the drawing honest. Every declared permission runs
// strictly downhill (a zone's layer is one above its deepest dependency), so ordering
// both axes by layer puts every lit cell on one side of the diagonal: acyclicity you
// can see rather than take on faith. A matrix also shows all ~108 permissions without
// a single crossing, which a node-link drawing at this density cannot.
//
// No colour decisions live here. This module owns geometry and ordering only; the
// component resolves every fill and stroke from theme tokens.

import { architectureMap } from './architecture-map.generated';

type GeneratedMap = typeof architectureMap;

// How a zone earns its files, as classified by the generator.
type ZoneNodeKind = GeneratedMap['nodes'][number]['kind'];

// The generator's three relation classes.
type ZoneEdgeKind = GeneratedMap['edges'][number]['kind'];

// The relation classes that become matrix cells. A carve-out is classification
// precedence, not a permission, so it annotates a row label instead.
type ZoneCellKind = Exclude<ZoneEdgeKind, 'carve-out'>;

type ZoneMapNode = { id: string; label: string; layer: number; kind: ZoneNodeKind };
type ZoneMapEdge = { from: string; to: string; kind: ZoneEdgeKind };

/** The generated graph as this module consumes it. */
export type ZoneMapGraph = {
  nodes: readonly ZoneMapNode[];
  edges: readonly ZoneMapEdge[];
};

// One lit cell: the row zone holds a declared permission on the column zone.
type ZoneMapCell = {
  from: string;
  to: string;
  kind: ZoneCellKind;
  x: number;
  y: number;
};

// One axis label, positioned for its row or column.
type ZoneMapLabel = { id: string; label: string; x: number; y: number };

// A marker beside the row label of a zone carved out of a later zone's patterns.
type ZoneMapMarker = { id: string; x: number; y: number };

/**
 * What a legend row explains. `forbidden` is an empty cell between two different zones —
 * the deny-by-default rule; `same-zone` is the diagonal, which the rules never restrict
 * because the boundary check only governs cross-zone imports.
 */
export type ZoneMapLegendKind = ZoneCellKind | 'carve-out' | 'same-zone' | 'forbidden';

// One legend row: its swatch kind, its text, and where both sit.
type ZoneMapLegendEntry = {
  kind: ZoneMapLegendKind;
  label: string;
  x: number;
  y: number;
};

/** Every coordinate the zone-map SVG needs, and nothing about colour. */
export type ZoneMapLayout = {
  width: number;
  height: number;
  gridX: number;
  gridY: number;
  pitch: number;
  litSize: number;
  order: string[];
  cells: ZoneMapCell[];
  rowLabels: ZoneMapLabel[];
  columnLabels: ZoneMapLabel[];
  carveOutMarkers: ZoneMapMarker[];
  legend: ZoneMapLegendEntry[];
  gridLines: number[];
  diagonal: { x1: number; y1: number; x2: number; y2: number };
};

const PITCH = 18;
const LIT_SIZE = 12;
// The label gutters have to clear the longest zone name: 22 characters at
// MONO_CHAR_WIDTH is 132px, plus LABEL_GAP, so 148 leaves a small margin on both axes.
// The layout test asserts every label and marker still fits, so shortening a gutter below
// what the live names need fails rather than clipping silently.
const GRID_X = 148;
const GRID_Y = 148;
const LABEL_GAP = 8;
const MARKER_GAP = 9;
const LEGEND_GAP = 30;
const LEGEND_ROW = 18;
const EDGE_PAD = 4;
// The legend starts under the row-label gutter rather than the grid, so its longest
// line has the full canvas width to run in.
const LEGEND_X = 8;
// Advance width of one character in the devlog's mono face at the label size. Labels
// are measured rather than guessed so the carve-out marker lands beside its text.
const MONO_CHAR_WIDTH = 6;

const LEGEND_TEXT: Record<ZoneMapLegendKind, string> = {
  allow: 'declared permission — the row zone may import the column zone',
  exception: 'sanctioned reference-core exception',
  'carve-out': 'first-match carve-out — classifies ahead of the covering zone',
  'same-zone': 'the diagonal — a zone with itself, which the rules never restrict',
  forbidden: 'empty cell — forbidden: between zones the rules are deny-by-default',
};

const LEGEND_ORDER: readonly ZoneMapLegendKind[] = [
  'allow',
  'exception',
  'carve-out',
  'same-zone',
  'forbidden',
];

function orderedNodes(graph: ZoneMapGraph): ZoneMapNode[] {
  // Stable sort, so nodes sharing a layer keep the generator's declaration order.
  return [...graph.nodes].sort((a, b) => b.layer - a.layer);
}

function indexById(graph: ZoneMapGraph): Map<string, number> {
  return new Map(orderedNodes(graph).map((node, position) => [node.id, position]));
}

function labelWidth(label: string): number {
  return label.length * MONO_CHAR_WIDTH;
}

function isCell(edge: ZoneMapEdge): edge is ZoneMapEdge & { kind: ZoneCellKind } {
  return edge.kind !== 'carve-out';
}

/** Row and column order for both axes: layer descending, declaration order as tiebreak. */
export function zoneOrder(graph: ZoneMapGraph): string[] {
  return orderedNodes(graph).map((node) => node.id);
}

/** Every declared permission as a positioned matrix cell. */
export function zoneCells(graph: ZoneMapGraph): ZoneMapCell[] {
  const index = indexById(graph);
  return graph.edges.filter(isCell).map((edge) => {
    // Both endpoints are graph nodes by construction: the generator refuses an edge
    // whose ends are not declared, so the order index covers every id it emits.
    const row = index.get(edge.from)!;
    const column = index.get(edge.to)!;
    return {
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      x: GRID_X + column * PITCH,
      y: GRID_Y + row * PITCH,
    };
  });
}

/** Axis labels plus the carve-out markers that annotate the affected rows. */
export function zoneLabels(graph: ZoneMapGraph): {
  rowLabels: ZoneMapLabel[];
  columnLabels: ZoneMapLabel[];
  carveOutMarkers: ZoneMapMarker[];
} {
  const nodes = orderedNodes(graph);
  const rowLabels = nodes.map((node, position) => ({
    id: node.id,
    label: node.label,
    x: GRID_X - LABEL_GAP,
    y: GRID_Y + position * PITCH + PITCH / 2,
  }));
  const columnLabels = nodes.map((node, position) => ({
    id: node.id,
    label: node.label,
    x: GRID_X + position * PITCH + PITCH / 2,
    y: GRID_Y - LABEL_GAP,
  }));
  return { rowLabels, columnLabels, carveOutMarkers: carveOutMarkers(graph, rowLabels) };
}

function carveOutMarkers(graph: ZoneMapGraph, rowLabels: ZoneMapLabel[]): ZoneMapMarker[] {
  const rows = new Map(rowLabels.map((label) => [label.id, label]));
  return graph.edges
    .filter((edge) => edge.kind === 'carve-out')
    .map((edge) => {
      // Row labels cover every node and the generator only emits edges between nodes,
      // so the carved-out zone always has a row.
      const row = rows.get(edge.from)!;
      return { id: edge.from, x: row.x - labelWidth(row.label) - MARKER_GAP, y: row.y };
    });
}

/** The four legend rows, in a fixed reading order, positioned under the grid. */
export function zoneLegend(graph: ZoneMapGraph): ZoneMapLegendEntry[] {
  const top = GRID_Y + graph.nodes.length * PITCH + LEGEND_GAP;
  return LEGEND_ORDER.map((kind, position) => ({
    kind,
    label: LEGEND_TEXT[kind],
    x: LEGEND_X,
    y: top + position * LEGEND_ROW,
  }));
}

/** Deterministic matrix layout for the zone map SVG; no colour decisions. */
export function layoutZoneMap(graph: ZoneMapGraph): ZoneMapLayout {
  const count = graph.nodes.length;
  const span = count * PITCH;
  const legend = zoneLegend(graph);
  return {
    width: GRID_X + span + EDGE_PAD,
    height: GRID_Y + span + LEGEND_GAP + legend.length * LEGEND_ROW,
    gridX: GRID_X,
    gridY: GRID_Y,
    pitch: PITCH,
    litSize: LIT_SIZE,
    order: zoneOrder(graph),
    cells: zoneCells(graph),
    ...zoneLabels(graph),
    legend,
    gridLines: Array.from({ length: count + 1 }, (_line, step) => step * PITCH),
    diagonal: { x1: GRID_X, y1: GRID_Y, x2: GRID_X + span, y2: GRID_Y + span },
  };
}

/** The committed generated graph, which is the devlog's single source for the map. */
export const zoneMapGraph: ZoneMapGraph = architectureMap;
