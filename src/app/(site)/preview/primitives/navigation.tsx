'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ContentBrowser } from '@/components/ui/content-browser';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuLink,
} from '@/components/ui/navigation-menu';
import { PageHead, PageTitle } from '@/components/ui/page-head';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { ReferenceGroup, Specimen, Variant } from './specimen';

const NAV_ITEMS = [
  { label: 'Industry', href: '#navigation', active: true },
  { label: 'Sites', href: '#navigation', active: false },
  { label: 'Atlas', href: '#navigation', active: false },
] as const;

const CHANGELOG_MODEL = {
  items: [
    { slug: 'v4.1', title: 'v4.1' },
    { slug: 'v4.0', title: 'v4.0' },
    { slug: 'v3.10', title: 'v3.10' },
  ],
};

export function NavigationGroup() {
  const [page, setPage] = useState(1);

  return (
    <ReferenceGroup
      id="navigation"
      title="Navigation"
      intro="Moving between views: tabs, pages, the header menu, rails, and page titles."
    >
      <Specimen
        name="Tabs"
        source="tabs"
        note="Keyboard-operable panels with a sliding active indicator."
      >
        <Tabs
          label="Build detail"
          defaultValue="plan"
          tabs={[
            { value: 'plan', label: 'Build plan', content: '3× Praxis · ME 8 · estimated margin +41.2M ISK' },
            { value: 'materials', label: 'Materials', content: 'Raw and intermediate material demand.' },
            { value: 'market', label: 'Market fit', content: 'Jita depth and sale velocity.' },
            { value: 'history', label: 'History', content: 'Saved runs.', disabled: true },
          ]}
        />
      </Specimen>

      <Specimen
        name="Pagination"
        source="pagination"
        note="Compact page controls beside an honest row count. Link mode via hrefForPage, callback mode via onPageChange."
      >
        <Pagination page={page} pageCount={12} total={284} pageSize={25} onPageChange={setPage} />
      </Specimen>

      <Specimen
        name="NavigationMenu"
        source="navigation-menu"
        note="The header tool menu: rounded links with an active glow and a disabled “soon” state."
      >
        <NavigationMenu label="Reference tools">
          {NAV_ITEMS.map((item) => (
            <NavigationMenuItem key={item.label} className="flex items-center">
              <NavigationMenuLink
                active={item.active}
                href={item.href}
                className={navigationMenuLink({ active: item.active })}
              >
                {item.label}
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
          <NavigationMenuItem className="flex items-center">
            <span className={navigationMenuLink({ disabled: true })}>Market</span>
          </NavigationMenuItem>
        </NavigationMenu>
      </Specimen>

      <Specimen
        name="PageHead"
        source="page-head"
        note="Display title, subtitle, and meta in three sizes, for pages the nav does not already name. PageTitle also stands alone."
      >
        <div className="flex flex-col gap-4">
          <PageHead size="compact" title="Compact head" subtitle="size=compact" reveal={false} />
          <Variant label="standalone title">
            <PageTitle size="compact">Standalone title</PageTitle>
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="ContentBrowser + NavRail"
        source="content-browser · nav-rail"
        note="A sticky glass rail beside a reading column; below lg it collapses into a drawer bar. This page's own contents rail uses NavRailFrame and NavRailTree."
        wide
      >
        <ContentBrowser
          basePath="/changelog"
          railLabel="Versions"
          navigationLabel="Changelog versions (sample)"
          landingSlug="v4.1"
          model={CHANGELOG_MODEL}
        >
          <Card className="p-5 font-ui text-ui text-text">
            The changelog uses this layout. Links in the rail open the real changelog.
          </Card>
        </ContentBrowser>
      </Specimen>
    </ReferenceGroup>
  );
}
