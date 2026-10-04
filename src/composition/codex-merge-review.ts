import { codexTemplate } from '@/composition/codex-templates';
import { parseCodexDoc, type CodexDoc } from '@/features/codex/doc';
import {
  mergeCodexProposal,
  readCodexProposal,
  readCodexRevisionDocs,
  type CodexProposalView,
} from '@/features/codex/proposals';

export interface CodexProposalMerge {
  readonly proposal: CodexProposalView;
  readonly headRevisionId: string | null;
  readonly merge: ReturnType<typeof mergeCodexProposal>;
}

async function templateDoc(proposal: CodexProposalView): Promise<CodexDoc | null> {
  const template = await codexTemplate(proposal.subject);
  const parsed = template ? parseCodexDoc(template.doc) : null;
  return parsed?.ok ? parsed.doc : null;
}

export async function loadCodexProposalMerge(id: string): Promise<CodexProposalMerge | null> {
  const proposal = await readCodexProposal(id);
  if (!proposal) return null;
  const ids = [proposal.baseRevisionId, proposal.headRevisionId].filter((value) => value !== null);
  const docs = await readCodexRevisionDocs([...new Set(ids)]);
  const base = proposal.baseRevisionId === null ? await templateDoc(proposal) : (docs.get(proposal.baseRevisionId) ?? null);
  const head = proposal.headRevisionId === null ? null : (docs.get(proposal.headRevisionId) ?? null);
  return { proposal, headRevisionId: proposal.headRevisionId, merge: mergeCodexProposal(proposal, base, head) };
}
