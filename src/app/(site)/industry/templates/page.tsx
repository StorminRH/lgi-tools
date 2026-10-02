import { WorkspaceRedirect, type WorkspaceSearchParams } from '../WorkspaceRedirect';

export default function BuildTemplatesPage({ searchParams }: { searchParams: WorkspaceSearchParams }) {
  return <WorkspaceRedirect searchParams={searchParams} tab="plans" />;
}
