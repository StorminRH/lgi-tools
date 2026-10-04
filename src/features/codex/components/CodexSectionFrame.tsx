import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export function CodexSectionFrame({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: ReactNode | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={title === null ? undefined : id}
      className={cn('scroll-mt-24 pt-10 first:pt-0', title === null && action && 'flow-root')}
    >
      {title === null ? (
        action ? <div className="float-right -mt-1 -mb-2 ml-3">{action}</div> : null
      ) : (
        <header className="mb-4 flex items-center justify-between gap-4 border-b border-border-soft pb-3">
          <h2 className="font-display text-h2 font-bold uppercase leading-none tracking-optical text-name">
            {title}
          </h2>
          {action ? <div className="-my-2 shrink-0">{action}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}
