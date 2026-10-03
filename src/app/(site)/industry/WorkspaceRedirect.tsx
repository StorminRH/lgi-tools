import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export type WorkspaceSearchParams = Promise<Record<string, string | string[] | undefined>>;

interface RedirectProps {
  searchParams: WorkspaceSearchParams;
  tab?: 'plans' | 'jobs';
  panel?: 'structures';
}

async function RedirectToWorkspace({ searchParams, tab, panel }: RedirectProps) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]) =>
      value === undefined ? [] : (Array.isArray(value) ? value : [value]).map((entry) => [key, entry]),
    ),
  );
  if (tab) query.set('tab', tab);
  if (panel) query.set('panel', panel);
  return redirect(`/industry?${query.toString()}`);
}

/** Resolve request-specific query parameters inside the streaming boundary. */
export function WorkspaceRedirect(props: {
  searchParams: WorkspaceSearchParams;
  tab?: 'plans' | 'jobs';
  panel?: 'structures';
}) {
  return (
    <Suspense>
      <RedirectToWorkspace {...props} />
    </Suspense>
  );
}
