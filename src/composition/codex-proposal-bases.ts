import { codexTemplate } from '@/composition/codex-templates';
import type { CodexBlockNode, CodexDoc } from '@/features/codex/doc';
import { readCodexRevisionDocs, type CodexProposalView } from '@/features/codex/proposals';
import { sectionBounds, sectionTitle } from '@/features/codex/sections';

export interface CodexProposalBase {
  readonly sectionTitle: string;
  readonly before: readonly CodexBlockNode[];
}

function baseSection(doc: CodexDoc | null, sectionId: string): CodexProposalBase {
  const bounds = doc ? sectionBounds(doc.content, sectionId) : null;
  return {
    sectionTitle: sectionTitle(doc, sectionId),
    before: doc && bounds ? doc.content.slice(bounds.start, bounds.end) : [],
  };
}

export async function loadCodexProposalBases(
  proposals: readonly CodexProposalView[],
): Promise<Map<string, CodexProposalBase>> {
  const baseIds = [...new Set(proposals.flatMap(({ baseRevisionId }) => (baseRevisionId ? [baseRevisionId] : [])))];
  const [revisions, templates] = await Promise.all([
    readCodexRevisionDocs(baseIds),
    Promise.all(
      proposals.map(async (proposal) =>
        proposal.baseRevisionId === null ? ((await codexTemplate(proposal.subject))?.doc ?? null) : null,
      ),
    ),
  ]);
  return new Map(
    proposals.map((proposal, index) => {
      const doc = proposal.baseRevisionId === null ? templates[index]! : (revisions.get(proposal.baseRevisionId) ?? null);
      return [proposal.id, baseSection(doc, proposal.sectionId)];
    }),
  );
}
