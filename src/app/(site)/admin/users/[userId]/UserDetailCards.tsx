import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { AdminForceLogoutForm } from '@/components/composition/account/AdminForceLogoutForm';
import { AdminReassignCharacterForm } from '@/components/composition/account/AdminReassignCharacterForm';
import { AdminUnlinkCharacterForm } from '@/components/composition/account/AdminUnlinkCharacterForm';
import { readEnv } from '@/lib/env';
import { formatCount } from '@/lib/format/number';
import { formatIsoDay } from '@/lib/format/time';
import { getActiveSessionCount, getUserById, type AdminUser } from '@/platform/auth/admin-users';
import {
  getStoredActiveCharacterId,
  listLinkedCharacters,
  type LinkedCharacter,
} from '@/platform/auth/linked-characters';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { AdminCard } from '../../AdminSection';
import { AdminCharacterRow } from '../AdminCharacterRow';
import { deriveIdentityChips, forceLogoutDisabled } from './user-detail-view';

/**
 * Starts every read the page needs at once. Each needs only the id, so no
 * card waits on the user lookup that decides whether there is a page at all.
 * Each card awaits its own read inside its section, which catches and logs a
 * failure; the empty handler here only stops a read that fails before its
 * card is rendered from being reported as unhandled.
 */
export function readUserDetail(userId: string) {
  const characters = listLinkedCharacters(userId);
  const superadminId = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  const reads = {
    user: getUserById(userId),
    characters,
    activeId: getStoredActiveCharacterId(userId),
    sessions: getActiveSessionCount(userId),
    /** Whether one of the account's characters is the env superadmin. */
    superadmin: characters.then((linked) => linked.some((character) => character.characterId === superadminId)),
  };
  for (const read of Object.values(reads) as Promise<unknown>[]) read.catch(() => undefined);
  return reads;
}

export function UserNotFound() {
  return (
    <AdminCard title="User not found" name="user-not-found">
      <EmptyState>No account matches that id.</EmptyState>
    </AdminCard>
  );
}

/** Without the account itself there is nothing to show the other cards against. */
export function AccountUnavailable() {
  return (
    <AdminCard title="Account" name="account">
      <EmptyState kind="unavailable">Unable to load this account.</EmptyState>
    </AdminCard>
  );
}

export function AccountIdentity({
  user,
  isSuperadmin,
  isViewerSelf,
}: {
  user: AdminUser;
  isSuperadmin: boolean;
  isViewerSelf: boolean;
}) {
  return (
    <ul>
      <AdminCharacterRow
        name={user.name}
        characterId={user.characterId}
        portraitUrl={user.portraitUrl}
        chips={deriveIdentityChips({ role: user.role, isSuperadmin, isViewerSelf }).map((chip) => (
          <Chip key={chip.label} tone={chip.tone}>
            {chip.label}
          </Chip>
        ))}
      />
    </ul>
  );
}

function CharacterChips({ character, isActive }: { character: LinkedCharacter; isActive: boolean }) {
  const health = deriveCharacterHealth({ scope: character.scope, hasRefreshToken: character.hasRefreshToken });
  return (
    <>
      <Pill tone="neutral" className="whitespace-nowrap">
        linked {formatIsoDay(character.linkedAt)}
      </Pill>
      {isActive ? <Chip tone="green">Selected</Chip> : null}
      {health.needsReconnect ? (
        <Chip tone="orange" className="normal-case">
          {character.hasRefreshToken ? 'Missing scopes' : 'Disconnected'}
        </Chip>
      ) : null}
    </>
  );
}

/**
 * The account's characters, each with the admin's actions. A character on
 * the viewing admin's own account offers no "Reassign to me".
 */
export function LinkedCharacterList({
  userId,
  characters,
  activeId,
  isViewerSelf,
}: {
  userId: string;
  characters: LinkedCharacter[];
  activeId: number | null;
  isViewerSelf: boolean;
}) {
  if (characters.length === 0) return <EmptyState>No characters linked to this account.</EmptyState>;
  return (
    <ul>
      {characters.map((character) => (
        <AdminCharacterRow
          key={character.characterId}
          name={character.name}
          characterId={character.characterId}
          portraitUrl={character.portraitUrl}
          chips={<CharacterChips character={character} isActive={character.characterId === activeId} />}
          actions={
            <>
              {isViewerSelf ? null : (
                <AdminReassignCharacterForm
                  characterId={character.characterId}
                  characterName={character.name}
                  fromUserId={userId}
                />
              )}
              <AdminUnlinkCharacterForm
                userId={userId}
                characterId={character.characterId}
                characterName={character.name}
                disabled={characters.length <= 1}
              />
            </>
          }
        />
      ))}
    </ul>
  );
}

export function SessionsBody({
  user,
  sessionCount,
  isViewerSelf,
}: {
  user: AdminUser;
  sessionCount: number;
  isViewerSelf: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="min-w-0 font-ui text-ui text-muted">
        {formatCount(sessionCount, 'unexpired session')} · logout may take a few minutes.
      </span>
      <AdminForceLogoutForm
        userId={user.userId}
        userName={user.name}
        disabled={forceLogoutDisabled(isViewerSelf, sessionCount)}
      />
    </div>
  );
}
