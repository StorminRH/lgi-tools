import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { AdminActivitySummary } from './AdminActivitySummary';
import { RoleToggleForm } from '@/features/auth/components/RoleToggleForm';
import {
  getCharacterById,
  listAdminCharacters,
  searchCharactersByName,
} from '@/features/auth/queries';
import { getSession, isAdmin } from '@/features/auth/session';
import type { Character } from '@/features/auth/types';

const MAX_QUERY_LENGTH = 200;
const CONTROL_CHARS = /\p{C}/gu;

// Strip control chars + truncate. Returns undefined for empty / clearly
// malformed input so the page falls back to the empty-q view.
function sanitiseQuery(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(CONTROL_CHARS, '').trim();
  if (cleaned.length === 0) return undefined;
  return cleaned.slice(0, MAX_QUERY_LENGTH);
}

// Build the Admins list shown above the search results. Includes the env
// superadmin synthetically when their DB role isn't already ADMIN — otherwise
// they'd be invisible on the page they have authority over.
async function buildAdminList(): Promise<
  Array<{ character: Character; isSuperadmin: boolean }>
> {
  const dbAdmins = await listAdminCharacters();
  const superId = Number(process.env.SUPERADMIN_CHARACTER_ID);
  const haveSuperId = Number.isFinite(superId) && superId > 0;
  const alreadyListed = dbAdmins.some(a => a.characterId === superId);

  const rows = dbAdmins.map(c => ({ character: c, isSuperadmin: c.characterId === superId }));
  if (haveSuperId && !alreadyListed) {
    const superChar = await getCharacterById(superId);
    if (superChar) rows.unshift({ character: superChar, isSuperadmin: true });
  }
  return rows;
}

function CharacterRow({
  character,
  isSuperadmin,
  viewerCharacterId,
  currentQuery,
  showToggle,
}: {
  character: Character;
  isSuperadmin: boolean;
  viewerCharacterId: number;
  currentQuery: string | undefined;
  showToggle: boolean;
}) {
  const roleChip = isSuperadmin ? (
    <Chip tone="purple">Superadmin</Chip>
  ) : character.role === 'ADMIN' ? (
    <Chip tone="purple">Admin</Chip>
  ) : (
    <Chip tone="blue">User</Chip>
  );

  return (
    <EntityRow
      cols="36px minmax(0,1fr) auto auto auto"
      leading={
        <Image
          src={character.portraitUrl}
          alt={character.name}
          width={28}
          height={28}
          className="rounded-[2px] border border-[#1e2c3a]"
        />
      }
      name={character.name}
      chips={
        <span className="flex items-center gap-[6px]">
          <Pill tone="neutral">ID {character.characterId}</Pill>
          {roleChip}
        </span>
      }
      trailing={
        showToggle ? (
          <RoleToggleForm
            targetCharacterId={character.characterId}
            currentRole={character.role}
            viewerCharacterId={viewerCharacterId}
            currentQuery={currentQuery}
          />
        ) : (
          <span className="text-[10px] text-muted whitespace-nowrap italic">
            managed via env
          </span>
        )
      }
    />
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const session = await getSession();
  if (!isAdmin(session)) {
    redirect('/?auth_error=admin_required');
  }
  // Non-null after the guard above.
  const viewer = session!;

  const raw = await searchParams;
  const query = sanitiseQuery(raw.q);

  const [adminRows, searchResults] = await Promise.all([
    buildAdminList(),
    query ? searchCharactersByName(query) : Promise.resolve([] as Character[]),
  ]);

  const adminIds = new Set(adminRows.map(r => r.character.characterId));
  const nonAdminMatches = searchResults.filter(c => !adminIds.has(c.characterId));

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <header className="w-full max-w-[1100px] mb-6 pb-4 border-b border-border-soft">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Admin
        </div>
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          {adminRows.length} admin{adminRows.length === 1 ? '' : 's'}
          {query ? ` · search "${query}"` : ''}
        </div>
      </header>

      <div className="w-full max-w-[1100px] flex flex-col gap-6">
        <AdminActivitySummary />

        <form method="GET" action="/admin" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query ?? ''}
            placeholder="Search by character name"
            maxLength={MAX_QUERY_LENGTH}
            className="flex-1 font-mono text-[12px] px-3 py-2 bg-bg border border-border text-text placeholder:text-muted focus:outline-none focus:border-[#2a3550]"
          />
          <button
            type="submit"
            className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-[#1e2c3a] hover:border-[#2a3550] text-isk transition-colors"
          >
            Search
          </button>
          {query ? (
            <a
              href="/admin"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted px-2 py-1"
            >
              Clear
            </a>
          ) : null}
        </form>

        <Card>
          <SectionHeader
            label="Admins"
            hint={`${adminRows.length} with elevated access`}
          />
          {adminRows.length === 0 ? (
            <EmptyState>No admins currently configured.</EmptyState>
          ) : (
            adminRows.map(({ character, isSuperadmin }) => (
              <CharacterRow
                key={character.characterId}
                character={character}
                isSuperadmin={isSuperadmin}
                viewerCharacterId={viewer.characterId}
                currentQuery={query}
                showToggle={!isSuperadmin}
              />
            ))
          )}
        </Card>

        {query ? (
          <Card>
            <SectionHeader
              label="Search results"
              hint={`${nonAdminMatches.length} match${nonAdminMatches.length === 1 ? '' : 'es'}`}
            />
            {nonAdminMatches.length === 0 ? (
              <EmptyState>
                No non-admin characters match &ldquo;{query}&rdquo;. Any matching admins are listed above.
              </EmptyState>
            ) : (
              nonAdminMatches.map(character => (
                <CharacterRow
                  key={character.characterId}
                  character={character}
                  isSuperadmin={false}
                  viewerCharacterId={viewer.characterId}
                  currentQuery={query}
                  showToggle={true}
                />
              ))
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
