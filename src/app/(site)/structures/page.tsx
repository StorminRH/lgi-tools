import { WorkspaceRedirect, type WorkspaceSearchParams } from '../industry/WorkspaceRedirect';

export default function StructuresPage({ searchParams }: { searchParams: WorkspaceSearchParams }) {
  return <WorkspaceRedirect searchParams={searchParams} panel="structures" />;
}
