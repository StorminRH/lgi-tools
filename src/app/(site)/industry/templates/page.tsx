import { WorkspaceRedirect, type WorkspaceSearchParams } from '../WorkspaceRedirect';

/** Templates are set aside for now; old links land on the workspace. */
export default function BuildTemplatesPage({ searchParams }: { searchParams: WorkspaceSearchParams }) {
  return <WorkspaceRedirect searchParams={searchParams} path="/industry" />;
}
