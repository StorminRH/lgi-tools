import { ESI_ERROR_CEILING } from './types';

export function effectiveRemaining(echo: number | null, selfCount: number): number {
  return Math.min(echo ?? ESI_ERROR_CEILING, ESI_ERROR_CEILING - selfCount);
}
