// The one position-reading contract for multi-client map probes.
//
// Lives outside docs/ux-check/probes/ because the runner treats every module in
// that directory as a probe definition. Firefox serializes translate(x, 0px) as
// the shorthand translate(x); a missing second component means y = 0. A parse
// miss is a probe defect, not sameness — callers must reject non-finite
// coordinates so a serialization change can never pass the identity check
// vacuously.
export function readNodePositions(target) {
  return target.evaluate(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')];
    return nodes
      .map((node) => {
        const transform = node.style.transform || '';
        const match = /translate\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/.exec(transform);
        return {
          id: node.dataset.id ?? node.getAttribute('data-id') ?? node.id,
          x: match ? Number(match[1]) : null,
          y: match ? Number(match[2] ?? 0) : null,
        };
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  });
}

/** True when every parsed coordinate is a finite number — the anti-vacuity gate. */
export function allPositionsFinite(positions) {
  return positions.every(
    (node) => Number.isFinite(node.x) && Number.isFinite(node.y),
  );
}

/**
 * Position identity through the DOM witness. React writes the identical JS
 * string into style.transform in every engine; browsers store it as float32
 * and re-serialize with engine-specific last-digit rules, so the CSS read-back
 * carries ~1e-4 px noise on byte-identical values. 0.01 px is far above that
 * noise and far below perception; JS-side byte-identity itself is pinned by
 * the committed digest suite.
 */
export function positionsMatch(a, b, epsilonPx = 0.01) {
  return (
    a.length === b.length
    && a.every(
      (node, index) =>
        node.id === b[index]?.id
        && Math.abs(node.x - b[index].x) <= epsilonPx
        && Math.abs(node.y - b[index].y) <= epsilonPx,
    )
  );
}
