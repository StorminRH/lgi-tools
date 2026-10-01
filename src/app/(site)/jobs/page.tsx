import { WorkspaceRedirect, type WorkspaceSearchParams } from '../industry/WorkspaceRedirect';

export default function JobsPage({ searchParams }: { searchParams: WorkspaceSearchParams }) {
  return <WorkspaceRedirect searchParams={searchParams} tab="jobs" />;
}
