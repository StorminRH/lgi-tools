import type { PillTone } from '@/components/ui/pill';
import type { CodexProposalStatus } from './schema';

export const CODEX_PROPOSAL_STATUS: Record<CodexProposalStatus, { tone: PillTone; label: string }> = {
  pending: { tone: 'orange', label: 'Pending review' },
  approved: { tone: 'green', label: 'Published' },
  denied: { tone: 'red', label: 'Denied' },
  withdrawn: { tone: 'neutral', label: 'Withdrawn' },
};
