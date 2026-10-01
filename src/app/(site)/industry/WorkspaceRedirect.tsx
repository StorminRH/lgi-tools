import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export type WorkspaceSearchParams = Promise<Record<string, string | string[] | undefined>>;

interface RedirectProps {
  searchParams: WorkspaceSearchParams;
  tab: 'plans' | 'jobs';
}

async function RedirectToWorkspace({ searchParams, tab }: RedirectProps) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]) =>
      value === undefined ? [] : (Array.isArray(value) ? value : [value]).map((entry) => [key, entry]),
    ),
  );
  query.set('tab', tab);
  return redirect(`/industry?${query.toString()}`);
}

/** Resolve request-specific query parameters inside the streaming boundary. */
export function WorkspaceRedirect(props: {
  searchParams: WorkspaceSearchParams;
  tab: 'plans' | 'jobs';
}) {
  return (
    <Suspense>
      <RedirectToWorkspace {...props} />
    </Suspense>
  );
}
