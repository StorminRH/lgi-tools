import type { ChainPosition } from '../chain/intents';
import { headingVector } from './geometry';
import { SEPARATION_MARGIN, type LayoutConfig } from './layout-contract';
import { distance } from './trig';

const ORPHANS_PER_ROW = 6;

function overflowBaseRadius(
  positions: ReadonlyMap<number, ChainPosition>,
  config: LayoutConfig,
): number {
  let maxRadius = 0;
  const origin = { x: 0, y: 0 };
  for (const position of positions.values()) {
    maxRadius = Math.max(maxRadius, distance(origin, position));
  }
  const quantum = 4 * config.ringSpacing;
  return Math.ceil((maxRadius + config.ringSpacing) / quantum) * quantum;
}

export function parkOrphans(
  positions: Map<number, ChainPosition>,
  orphans: readonly number[],
  config: LayoutConfig,
): void {
  if (orphans.length === 0) return;

  const heading = config.directionSequence[config.directionSequence.length - 1] ?? 0;
  const along = headingVector(heading);
  const acrossX = -along.y;
  const acrossY = along.x;

  const baseRadius = overflowBaseRadius(positions, config);
  const columnSpacing = config.minSeparation * SEPARATION_MARGIN;

  for (const [index, systemId] of orphans.entries()) {
    const row = Math.floor(index / ORPHANS_PER_ROW);
    const column = (index % ORPHANS_PER_ROW) - (ORPHANS_PER_ROW - 1) / 2;
    const distance = baseRadius + row * config.ringSpacing;
    const across = column * columnSpacing;
    positions.set(systemId, {
      x: along.x * distance + acrossX * across,
      y: along.y * distance + acrossY * across,
    });
  }
}
