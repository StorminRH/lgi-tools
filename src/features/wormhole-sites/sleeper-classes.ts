import type { SleeperClassCode } from './schema';

export const SLEEPER_CLASS_LABEL: Record<SleeperClassCode, string> = {
  F: 'Frigate',
  C: 'Cruiser',
  B: 'Battleship',
  T: 'Sentry',
};

export const SLEEPER_CLASS_ORDER: SleeperClassCode[] = ['F', 'C', 'B', 'T'];
