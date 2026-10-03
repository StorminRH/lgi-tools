import { redirect } from 'next/navigation';
import { type ComponentProps, Suspense } from 'react';

export type WorkspaceSearchParams = Promise<Record<string, string | string[] | undefined>>;

async function RedirectToWorkspace({ searchParams, path, panel }: ComponentProps<typeof WorkspaceRedirect>) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]) =>
      value === undefined ? [] : (Array.isArray(value) ? value : [value]).map((entry) => [key, entry]),
    ),
  );
  // The old section query has no meaning now that each section has its own path.
  query.delete('tab');
  if (panel) query.set('panel', panel);
  const search = query.toString();
  return redirect(search === '' ? path : `${path}?${search}`);
}

/** Resolve request-specific query parameters inside the streaming boundary. */
export function WorkspaceRedirect(props: {
  searchParams: WorkspaceSearchParams;
  path: '/industry' | '/industry/jobs';
  panel?: 'structures';
}) {
  return (
    <Suspense>
      <RedirectToWorkspace {...props} />
    </Suspense>
  );
}
