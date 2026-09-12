export const SYNTHETIC_PILOT = {
  userId: 'e2e-pilot',
  characterId: 9_000_001,
  name: 'E2E Pilot',
  role: 'USER',
} as const;

export const SYNTHETIC_PILOT_MINT_PATH = '/api/dev/synthetic-pilot' as const;

export function canMintSyntheticPilotRequest(request: Request): boolean {
  const url = new URL(request.url);
  return canMintSyntheticPilot({
    hostHeader: request.headers.get('host'),
    nodeEnv: process.env.NODE_ENV,
  }) && url.hostname === 'localhost'
    && request.headers.get('host') === url.host
    && request.headers.get('origin') === url.origin;
}

export function canMintSyntheticPilot(input: {
  hostHeader: string | null;
  nodeEnv: string | undefined;
}): boolean {
  if (input.nodeEnv !== 'development') return false;
  if (input.hostHeader === null || !/^localhost(?::[0-9]{1,5})?$/.test(input.hostHeader)) {
    return false;
  }
  try {
    return new URL(`http://${input.hostHeader}`).hostname === 'localhost';
  } catch {
    return false;
  }
}
