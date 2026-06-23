import type { SleeperClassCode } from './schema';

// Display config for the Sleeper hull classes — the labels and the order they
// read in. Kept out of the component layer so both the card UI and the
// pure aggregation logic (npc-summary) can share it without a logic→UI import.

/** Hull-class code (the F/C/B/T stored on each NPC) → display label. T is the
 *  Sentry tower/turret archetype, not a ship hull. */
export const SLEEPER_CLASS_LABEL: Record<SleeperClassCode, string> = {
  F: 'Frigate',
  C: 'Cruiser',
  B: 'Battleship',
  T: 'Sentry',
};

/** Order the class mix reads on a card: ascending hull size, sentries last. */
export const SLEEPER_CLASS_ORDER: SleeperClassCode[] = ['F', 'C', 'B', 'T'];
