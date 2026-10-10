'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { StatusPanel } from './StatusPanel';

/** The status card shared by the route error boundaries; logs the error once. */
export function ErrorPanel({
  source,
  error,
  onRetry,
  eyebrow,
  title,
  children,
}: {
  source: string;
  error: Error & { digest?: string };
  onRetry: () => void;
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  useEffect(() => {
    console.error(`[${source}]`, error);
  }, [source, error]);

  const digest = error.digest;
  return (
    <StatusPanel
      eyebrow={eyebrow}
      title={title}
      meta={
        digest ? (
          <div className="mt-2 inline-flex items-center gap-2">
            <span className="text-label text-muted tracking-eyebrow uppercase">
              Incident
            </span>
            <Pill tone="neutral">{digest}</Pill>
          </div>
        ) : null
      }
      actions={
        <>
          <Button type="button" variant="primary" onClick={onRetry}>Try again</Button>
          <Link href="/" className={cn(buttonVariants({ variant: 'secondary' }))}>
            Warp to home
          </Link>
        </>
      }
    >
      {children}
    </StatusPanel>
  );
}
