'use client';

import { typeNamesClient } from './type-names-client';
import { useNames } from './use-names';

export function useTypeNames(typeIds: readonly number[]): Record<string, string> {
  return useNames(typeIds, typeNamesClient);
}
