import type { BoardTransitionType } from './board-view-model';

type MotionClass = { [type in BoardTransitionType | 'default']: string };

function forEveryType(className: string): MotionClass {
  return { 'board-focus': className, 'board-overview': className, 'board-switch': className, default: 'none' };
}

/**
 * The card area swaps in two phases on every view change: the outgoing
 * cards fade out, then the incoming ones rise in, the second wave a beat
 * later. Timings live in HomeBoardView.css; any other transition leaves the
 * board alone.
 */
export const CARDS_MOTION = { enter: forEveryType('board-cards-in'), exit: forEveryType('board-cards-out') };
export const LATE_CARDS_MOTION = { enter: forEveryType('board-cards-in-late'), exit: forEveryType('board-cards-out') };
export const LEADERS_MOTION = { exit: forEveryType('board-cards-out') };
