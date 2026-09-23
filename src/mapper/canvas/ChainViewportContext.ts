'use client';

import { createContext } from 'react';

export const ChainViewportContext = createContext<Set<() => void> | null>(null);
