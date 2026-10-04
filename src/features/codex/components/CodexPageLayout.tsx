import type { ReactNode } from 'react';

export function CodexPageLayout({
  header,
  actions,
  article,
  aside,
}: {
  header: ReactNode;
  actions?: ReactNode;
  article: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="pb-20">
      <div className="flex w-full flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6">
        <div className="min-w-0">{header}</div>
        {actions}
      </div>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_200px]">
        <article className="flow-root min-w-0 max-w-[760px]">{article}</article>
        {aside}
      </div>
    </div>
  );
}
