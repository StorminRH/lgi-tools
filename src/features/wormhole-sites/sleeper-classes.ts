/** Sleeper hull classes, in display order: hull size, then sentries. */
export const SLEEPER_CLASS_CODES = ['F', 'C', 'B', 'T'] as const;
export type SleeperClassCode = typeof SLEEPER_CLASS_CODES[number];

export function isSleeperClassCode(code: string): code is SleeperClassCode {
  return (SLEEPER_CLASS_CODES as readonly string[]).includes(code);
}

export const SLEEPER_CLASS_LABEL: Record<SleeperClassCode, string> = {
  F: 'Frigate',
  C: 'Cruiser',
  B: 'Battleship',
  T: 'Sentry',
};
