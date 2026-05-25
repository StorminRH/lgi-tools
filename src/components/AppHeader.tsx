import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { LoginButton } from '@/features/auth/components/LoginButton';
import type { Session } from '@/features/auth/types';

// Application-shell header. Brand wordmark on the left (links back to the
// landing); login chip on the right. Parallel to `Footer.tsx` wrapping the
// `PageFooter` primitive — `PageHeader` stays domain-agnostic.
export function AppHeader({
  session,
  showAdminLink,
}: {
  session: Session | null;
  showAdminLink: boolean;
}) {
  return (
    <PageHeader
      left={
        <Link
          href="/"
          className="font-display font-bold text-[14px] tracking-[0.04em] uppercase text-name"
        >
          LGI<span className="text-muted">.</span>tools
        </Link>
      }
      right={<LoginButton session={session} showAdminLink={showAdminLink} />}
    />
  );
}
