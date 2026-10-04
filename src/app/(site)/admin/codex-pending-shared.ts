import { cache } from 'react';
import { countPendingCodexProposals } from '@/features/codex/proposals';

export const getCodexPendingShared = cache(countPendingCodexProposals);
