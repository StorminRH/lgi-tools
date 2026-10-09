import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { listCodexIndex } from '@/composition/codex-templates';
import { ArrowRightIcon, ClassIcon, GuideIcon, SiteIcon, WormholeIcon } from '@/features/codex/components/icons';
import { formatCodexDate } from '@/features/codex/format';
import { filterCodexIndex } from '@/features/codex/index-search';
import { listRecentCodexEdits, type CodexRecentEdit } from '@/features/codex/queries';
import {
  CODEX_SUBJECT_KINDS,
  CODEX_SUBJECTS,
  codexKindHref,
  codexPageHref,
  type CodexSubjectKind,
} from '@/features/codex/subjects';
import { buildPageMetadata } from '@/lib/page-metadata';

export const codexIndexMetadata = buildPageMetadata({
  title: 'Codex',
  description: 'The pilot-written field guide to wormhole space.',
  canonical: '/codex',
});

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const KIND_ICONS: Record<CodexSubjectKind, { Icon: typeof GuideIcon; className: string }> = {
  wormholes: { Icon: WormholeIcon, className: 'text-tone-blue' },
  sites: { Icon: SiteIcon, className: 'text-tone-red-soft' },
  classes: { Icon: ClassIcon, className: 'text-tone-purple' },
  guides: { Icon: GuideIcon, className: 'text-isk' },
};

function KindTile({ kind, count }: { kind: CodexSubjectKind; count: number }) {
  const spec = CODEX_SUBJECTS[kind];
  const { Icon, className } = KIND_ICONS[kind];
  return (
    <Link href={codexKindHref(kind)} className="block h-full">
      <Card hover className="flex h-full flex-col gap-5 rounded-panel px-5 py-5">
        <div className="flex items-start justify-between">
          <span
            className={cn('flex size-10 items-center justify-center rounded-full border border-border bg-bg-deep/60', className)}
          >
            <Icon size={20} />
          </span>
          <ArrowRightIcon size={16} className="text-faint" />
        </div>
        <div>
          <div className="font-display text-h2 font-bold uppercase leading-none tracking-optical text-name">
            {spec.label}
          </div>
          <div className="mt-1.5 font-data text-ui tabular-nums text-muted">
            {count} {spec.nouns[count === 1 ? 0 : 1]}
          </div>
        </div>
        <p className="mt-auto font-ui text-ui text-text">{spec.blurb}</p>
      </Card>
    </Link>
  );
}

function readQuery(query: Awaited<SearchParams>): string {
  return typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
}

function SearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form method="get" action="/codex" role="search" className="min-w-0 flex-1 basis-80 sm:max-w-[640px]">
      <Input
        prompt
        name="q"
        defaultValue={defaultValue}
        placeholder="Search wormholes, sites, classes, and guides"
        aria-label="Search the Codex"
      />
    </form>
  );
}

async function CodexSearchBox({ searchParams }: { searchParams: SearchParams }) {
  return <SearchForm defaultValue={readQuery(await searchParams)} />;
}

export async function CodexSearchResults({ searchParams }: { searchParams: SearchParams }) {
  const q = readQuery(await searchParams);
  if (q === '') return null;
  const hits = filterCodexIndex(await listCodexIndex(), q);
  return (
    <Card className="overflow-hidden">
      <SectionHeader size="md" label={`Results for "${q}"`} />
      {hits.length === 0 ? <EmptyState>{`No matches for "${q}".`}</EmptyState> : null}
      <ul>
        {hits.map((hit) => (
          <li key={`${hit.kind}/${hit.key}`} className="border-b border-border-soft last:border-b-0">
            <Link
              href={codexPageHref({ kind: hit.kind, key: hit.key })}
              className="flex items-center gap-2 px-4 py-3 font-ui text-nav text-name hover:bg-row-hover"
            >
              {hit.title}
              <Pill tone={CODEX_SUBJECTS[hit.kind].tone}>{CODEX_SUBJECTS[hit.kind].singular}</Pill>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function editLine({ character, summary }: CodexRecentEdit): string {
  const name = character?.name ?? 'Unknown pilot';
  return summary ? `${name}: ${summary}` : `${name} edited this page`;
}

export async function RecentEdits() {
  const edits = await listRecentCodexEdits(5);
  return (
    <Card className="overflow-hidden">
      <SectionHeader size="md" label="Recently updated" />
      {edits.length === 0 ? <EmptyState>Nothing has been written yet.</EmptyState> : null}
      <ul>
        {edits.map((edit) => (
          <li key={`${edit.kind}/${edit.key}`} className="border-b border-border-soft last:border-b-0">
            <Link
              href={codexPageHref({ kind: edit.kind, key: edit.key })}
              className="flex items-center gap-3.5 px-4 py-3 hover:bg-row-hover"
            >
              <CharacterPortrait
                characterId={edit.character?.id}
                name={edit.character?.name ?? 'Unknown pilot'}
                size={32}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-ui text-nav font-medium text-name">{edit.title}</span>
                  <Pill tone={CODEX_SUBJECTS[edit.kind].tone}>{CODEX_SUBJECTS[edit.kind].singular}</Pill>
                </div>
                <div className="mt-0.5 font-ui text-ui text-muted">{editLine(edit)}</div>
              </div>
              <span className="shrink-0 font-ui text-ui text-faint">{formatCodexDate(edit.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export async function CodexIndex({ searchParams, actions }: { searchParams: SearchParams; actions?: ReactNode }) {
  const index = await listCodexIndex();
  return (
    <PageShell mode="workspace">
      <div className="flex flex-col gap-8 pb-20">
        <PageHead
          title="Codex"
          subtitle="The pilot-written field guide to wormhole space. Game data stays live; the advice comes from people who fly it."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<SearchForm />}>
            <CodexSearchBox searchParams={searchParams} />
          </Suspense>
          {actions}
        </div>
        <Suspense fallback={null}>
          <CodexSearchResults searchParams={searchParams} />
        </Suspense>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CODEX_SUBJECT_KINDS.map((kind) => (
            <li key={kind}>
              <KindTile kind={kind} count={index.filter((row) => row.kind === kind).length} />
            </li>
          ))}
        </ul>
        <Suspense fallback={null}>
          <RecentEdits />
        </Suspense>
      </div>
    </PageShell>
  );
}
