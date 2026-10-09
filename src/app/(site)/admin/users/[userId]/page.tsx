import { Callout } from '@/components/ui/callout';
import { requireAdminPage } from '@/composition/route-guards';
import { resolveErrorMessage } from '@/lib/error-copy';
import { AdminPageFrame } from '../../AdminFrame';
import { AdminSection } from '../../AdminSection';
import { loadSection, SECTION_LOAD_FAILED } from '../../load-section';
import {
  AccountIdentity,
  AccountUnavailable,
  LinkedCharacterList,
  readUserDetail,
  SessionsBody,
  UserNotFound,
} from './UserDetailCards';

const ERROR_MESSAGES: Record<string, string> = {
  last_character:
    "That's the user's only character — unlinking it would strand the account. Reassign it instead.",
  unlink_failed: 'Could not unlink that character. Please try again.',
};

async function UserDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const [{ userId }, { error: rawError }, session] = await Promise.all([params, searchParams, requireAdminPage()]);
  const reads = readUserDetail(userId);
  const user = await loadSection('user-detail', () => reads.user);
  if (user === SECTION_LOAD_FAILED) return <AccountUnavailable />;
  if (user === null) return <UserNotFound />;

  const isViewerSelf = userId === session.user.id;
  const error = resolveErrorMessage(rawError, ERROR_MESSAGES, 'That action could not be completed.');
  return (
    <>
      {error ? <Callout label="Heads up">{error}</Callout> : null}
      <AdminSection title="Account" name="account" rows={1} reveal={1} load={() => reads.superadmin}>
        {(isSuperadmin) => <AccountIdentity user={user} isSuperadmin={isSuperadmin} isViewerSelf={isViewerSelf} />}
      </AdminSection>
      <AdminSection
        title="Linked characters"
        name="linked-characters"
        rows={2}
        reveal={2}
        load={() => Promise.all([reads.characters, reads.activeId])}
      >
        {([characters, activeId]) => (
          <LinkedCharacterList
            userId={userId}
            characters={characters}
            activeId={activeId}
            isViewerSelf={isViewerSelf}
          />
        )}
      </AdminSection>
      <AdminSection title="Sessions" name="sessions" rows={1} reveal={3} load={() => reads.sessions}>
        {(sessionCount) => <SessionsBody user={user} sessionCount={sessionCount} isViewerSelf={isViewerSelf} />}
      </AdminSection>
    </>
  );
}

export default function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  return (
    <AdminPageFrame title="User" fallbackLabel="Account">
      <UserDetailContent params={params} searchParams={searchParams} />
    </AdminPageFrame>
  );
}
