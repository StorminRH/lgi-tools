import { requireAdminPage } from '@/composition/route-guards';
import { AdminPageFrame } from '../AdminFrame';
import { AdminSection } from '../AdminSection';
import {
  AccessSearchForm,
  AdminList,
  loadAdminRows,
  loadRoleAudit,
  loadSearchMatches,
  RoleAuditTable,
  SearchMatches,
} from './AccessCards';
import { sanitiseQuery } from './access-view';

// The search form needs only the query, so it renders at once; each card
// then loads on its own, and a failed audit read leaves access management.
async function AccessContent({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const [raw, session] = await Promise.all([searchParams, requireAdminPage()]);
  const query = sanitiseQuery(raw.q);
  const viewerUserId = session.user.id;

  return (
    <>
      <AccessSearchForm query={query} />
      <AdminSection title="Admins" name="admins" rows={2} reveal={1} load={loadAdminRows}>
        {(rows) => <AdminList rows={rows} viewerUserId={viewerUserId} query={query} />}
      </AdminSection>
      {query ? (
        <AdminSection
          title="Search results"
          name="search-results"
          rows={3}
          reveal={2}
          hint={(results) => results.resultsHint}
          load={() => loadSearchMatches(query)}
        >
          {(results) => <SearchMatches matches={results.nonAdminMatches} query={query} viewerUserId={viewerUserId} />}
        </AdminSection>
      ) : null}
      <AdminSection title="Role change audit" name="role-audit" rows={3} reveal={3} load={loadRoleAudit}>
        {(audit) => <RoleAuditTable audit={audit} />}
      </AdminSection>
    </>
  );
}

export default function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  return (
    <AdminPageFrame title="Users & roles" fallbackLabel="Admins">
      <AccessContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
