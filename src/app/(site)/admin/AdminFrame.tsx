import { Suspense, type ReactNode } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
import { QuietSectionHead } from '@/components/ui/section-head';
import { adminSection, type AdminSectionId } from './admin-sections';
import { AdminGate } from './AdminGate';
import { CardFallback } from './CardFallback';
import { RangeControl } from './RangeControl';

// The section table names a console page and decides whether it has a range control.
function sectionHeading(id: AdminSectionId): { title: string; rangeBasePath: `/${string}` | null } {
  const { title, href, ranged } = adminSection(id);
  return { title, rangeBasePath: ranged ? href : null };
}

export function AdminPageFrame({
  actions,
  fallbackLabel,
  children,
  ...heading
}: (
  | { section: AdminSectionId; title?: never }
  // A page with no range to choose, such as one user's detail, names itself.
  | { title: string; section?: never }
) & {
  actions?: ReactNode;
  fallbackLabel: string;
  children: ReactNode;
}) {
  const { title, rangeBasePath } =
    heading.section === undefined ? { title: heading.title, rangeBasePath: null } : sectionHeading(heading.section);
  return (
    <Suspense fallback={<LoadingLabel />}>
      <AdminGate>
        <QuietSectionHead
          title={title}
          onTitleLine
          meta={
            actions || rangeBasePath ? (
              <>
                {actions}
                {rangeBasePath ? <RangeControl basePath={rangeBasePath} /> : null}
              </>
            ) : undefined
          }
        />
        <Suspense fallback={<CardFallback label={fallbackLabel} rows={5} />}>{children}</Suspense>
      </AdminGate>
    </Suspense>
  );
}
