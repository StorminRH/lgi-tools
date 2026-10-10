import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { StatusPanel } from './StatusPanel';

export function NotFoundContent() {
  return (
    <StatusPanel
      eyebrow="404 · Signature lost"
      title="Nothing on D-Scan"
      actions={
        <Link href="/" className={buttonVariants({ variant: 'primary' })}>
          Warp to home
        </Link>
      }
    >
      This page doesn’t exist.
    </StatusPanel>
  );
}
