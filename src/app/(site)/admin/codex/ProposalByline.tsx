import Link from 'next/link';
import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import type { CodexProposalView } from '@/features/codex/proposals';
import { codexPageHref } from '@/features/codex/subjects';

export function ProposalByline({
  proposal,
  sectionTitle,
  trailing,
  children,
}: {
  proposal: CodexProposalView;
  sectionTitle: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <CharacterPortrait characterId={proposal.character.id} name={proposal.character.name} size={38} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-ui text-nav font-medium text-name">{proposal.character.name}</span>
          <span className="font-ui text-ui text-muted">suggested an edit to</span>
          <Link href={codexPageHref(proposal.subject)} className="font-ui text-ui text-isk hover:underline">
            {proposal.pageTitle}
          </Link>
          <span className="text-faint">›</span>
          <span className="font-ui text-ui text-text">{sectionTitle}</span>
          {trailing}
        </div>
        <p className="mt-1 font-ui text-ui text-text">“{proposal.summary}”</p>
        {children}
      </div>
    </>
  );
}
