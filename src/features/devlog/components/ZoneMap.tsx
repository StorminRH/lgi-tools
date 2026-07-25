import {
  layoutZoneMap,
  zoneMapGraph,
  type ZoneMapLayout,
  type ZoneMapLegendKind,
} from '../zone-map-geometry';

// The devlog's architecture map: a static permission matrix drawn from the committed
// generated graph. Rows are importing zones, columns are the zones they may import, and
// a lit cell is a declared permission — so an empty cell is the deny-by-default rule
// made visible. Both axes share one layer-descending order, which is why every lit cell
// sits above the diagonal.
//
// Deliberately a dumb server component: it takes every coordinate from the tested pure
// layout helper and every colour from a theme token, holds no state, adds no client
// bundle, and renders no interactive affordance.

type MarkStyle = { className: string; rotate: number };

// The only place the map's classes are decided. Each entry names a token-backed
// Tailwind utility — no hex, no ad-hoc palette — and the rotation is what distinguishes
// the carve-out's diamond from the square permission cells.
const MARK_STYLE: Record<ZoneMapLegendKind, MarkStyle> = {
  allow: { className: 'fill-isk', rotate: 0 },
  exception: { className: 'fill-none stroke-isk', rotate: 0 },
  'carve-out': { className: 'fill-tone-orange', rotate: 45 },
  forbidden: { className: 'fill-none stroke-border-active', rotate: 0 },
};

function Mark({
  kind,
  cx,
  cy,
  size,
  cell,
}: {
  kind: ZoneMapLegendKind;
  cx: number;
  cy: number;
  size: number;
  cell?: boolean;
}) {
  const style = MARK_STYLE[kind];
  return (
    <rect
      data-zone-cell={cell}
      className={style.className}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      strokeWidth={1.25}
      transform={`rotate(${style.rotate} ${cx} ${cy})`}
    />
  );
}

function ZoneMapGrid({ layout }: { layout: ZoneMapLayout }) {
  return (
    <g className="stroke-border" strokeWidth={0.5}>
      {layout.gridLines.map((offset) => (
        <line
          key={`column-${offset}`}
          x1={layout.gridX + offset}
          y1={layout.gridY}
          x2={layout.gridX + offset}
          y2={layout.diagonal.y2}
        />
      ))}
      {layout.gridLines.map((offset) => (
        <line
          key={`row-${offset}`}
          x1={layout.gridX}
          y1={layout.gridY + offset}
          x2={layout.diagonal.x2}
          y2={layout.gridY + offset}
        />
      ))}
      <line
        className="stroke-isk-dim"
        strokeWidth={1}
        x1={layout.diagonal.x1}
        y1={layout.diagonal.y1}
        x2={layout.diagonal.x2}
        y2={layout.diagonal.y2}
      />
    </g>
  );
}

function ZoneMapCells({ layout }: { layout: ZoneMapLayout }) {
  const half = layout.pitch / 2;
  return (
    <g>
      {layout.cells.map((cell) => (
        <Mark
          key={`${cell.from}-${cell.to}`}
          kind={cell.kind}
          cx={cell.x + half}
          cy={cell.y + half}
          size={layout.litSize}
          cell
        />
      ))}
    </g>
  );
}

function ZoneMapAxes({ layout }: { layout: ZoneMapLayout }) {
  return (
    <g className="fill-muted font-mono text-micro">
      {layout.rowLabels.map((row) => (
        <text key={row.id} x={row.x} y={row.y} textAnchor="end" dominantBaseline="middle">
          {row.label}
        </text>
      ))}
      {layout.columnLabels.map((column) => (
        <text
          key={column.id}
          x={column.x}
          y={column.y}
          textAnchor="start"
          dominantBaseline="middle"
          transform={`rotate(-90 ${column.x} ${column.y})`}
        >
          {column.label}
        </text>
      ))}
      {layout.carveOutMarkers.map((marker) => (
        <Mark
          key={marker.id}
          kind="carve-out"
          cx={marker.x}
          cy={marker.y}
          size={layout.litSize / 2}
        />
      ))}
    </g>
  );
}

function ZoneMapLegend({ layout }: { layout: ZoneMapLayout }) {
  const half = layout.litSize / 2;
  return (
    <g className="fill-faint font-mono text-micro">
      {layout.legend.map((entry) => (
        <text key={entry.kind} x={entry.x + layout.litSize + 8} y={entry.y} dominantBaseline="middle">
          {entry.label}
        </text>
      ))}
      {layout.legend.map((entry) => (
        <Mark
          key={`swatch-${entry.kind}`}
          kind={entry.kind}
          cx={entry.x + half}
          cy={entry.y}
          size={layout.litSize}
        />
      ))}
    </g>
  );
}

/**
 * The generated zone dependency map, drawn as a static permission matrix. Takes no
 * props: the committed generated graph is its single source.
 */
export function ZoneMap() {
  const layout = layoutZoneMap(zoneMapGraph);
  return (
    <figure className="my-6">
      <div className="overflow-x-auto">
        <svg
          data-zone-map
          data-zone-count={layout.order.length}
          data-cell-count={layout.cells.length}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          className="max-w-none"
        >
          <title>
            {`Zone dependency matrix: ${layout.order.length} zones and ${layout.cells.length} declared permissions. Each row may import the zones lit along it; an empty cell is forbidden.`}
          </title>
          <ZoneMapGrid layout={layout} />
          <ZoneMapCells layout={layout} />
          <ZoneMapAxes layout={layout} />
          <ZoneMapLegend layout={layout} />
        </svg>
      </div>
    </figure>
  );
}
