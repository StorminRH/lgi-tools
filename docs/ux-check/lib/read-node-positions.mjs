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

export function allPositionsFinite(positions) {
  return positions.every(
    (node) => Number.isFinite(node.x) && Number.isFinite(node.y),
  );
}

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
