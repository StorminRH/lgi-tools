export const SYNTHETIC_PILOT = {
  userId: 'e2e-pilot',
  characterId: 9_000_001,
  name: 'E2E Pilot',
  role: 'USER',
} as const;

export const SYNTHETIC_PILOT_MINT_PATH = '/api/dev/synthetic-pilot' as const;

export function canMintSyntheticPilot(input: {
  requestUrl: string;
  nodeEnv: string | undefined;
}): boolean {
  if (input.nodeEnv !== 'development') return false;
  try {
    return new URL(input.requestUrl).hostname === 'localhost';
  } catch {
    return false;
  }
}
