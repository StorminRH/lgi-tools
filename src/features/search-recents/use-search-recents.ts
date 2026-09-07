'use client';

import { useSyncExternalStore } from 'react';
import type { SearchResult } from '@/platform/search';
import {
  getRecentsServerSnapshot,
  getRecentsSnapshot,
  subscribeRecents,
} from './storage';

export function useSearchRecents(): SearchResult[] {
  return useSyncExternalStore(
    subscribeRecents,
    getRecentsSnapshot,
    getRecentsServerSnapshot,
  );
}
