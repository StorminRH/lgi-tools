'use client';

import { useSearchParams } from 'next/navigation';
import { addTransitionType, type ReactNode, startTransition, useEffect, useState, ViewTransition } from 'react';
import { Tabs } from '@/components/ui/tabs';

function section(value: string | null): string {
  return value === 'plans' || value === 'jobs' ? value : 'profiles';
}

/** Industry sections are persistent panels, never route links. */
export function IndustryWorkspaceTabs({ profiles, plans, jobs }: {
  profiles: ReactNode;
  plans: ReactNode;
  jobs: ReactNode;
}) {
  const params = useSearchParams();
  const requested = section(params.get('tab'));
  const [selected, setSelected] = useState(requested);
  const [visited, setVisited] = useState(() => new Set([requested]));

  useEffect(() => {
    if (requested !== selected) startTransition(() => {
      addTransitionType('industry-tab');
      setSelected(requested);
      setVisited((previous) => new Set(previous).add(requested));
    });
  }, [requested, selected]);

  const select = (next: string) => {
    if (next === selected) return;
    const url = new URL(window.location.href);
    if (next === 'profiles') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
    startTransition(() => {
      addTransitionType('industry-tab');
      setSelected(next);
      setVisited((previous) => new Set(previous).add(next));
    });
  };

  return (
    <Tabs
      label="Industry workspace sections"
      value={selected}
      onValueChange={select}
      keepMounted
      listClassName="overflow-x-auto"
      tabClassName="shrink-0 whitespace-nowrap"
      panelClassName="px-0 py-5"
      tabs={[
        { value: 'profiles', label: 'Profiles', content: profiles },
        { value: 'plans', label: 'Plans & templates', content: plans },
        { value: 'jobs', label: 'Active jobs', content: jobs },
      ].map((tab) => ({
        ...tab,
        content: (
          <ViewTransition name={`industry-${tab.value}`} default={{ 'industry-tab': 'industry-section', default: 'none' }}>
            <div>{visited.has(tab.value) ? tab.content : null}</div>
          </ViewTransition>
        ),
      }))}
    />
  );
}
