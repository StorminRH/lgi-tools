import Link from 'next/link';
import { LoginButton } from '@/features/auth/components/LoginButton';
import { NavTools } from '@/components/NavTools';
import type { Session } from '@/features/auth/types';

// Application-shell header. Three-slot layout — bracket-stamp wordmark on
// the left, cross-tool nav strip in the middle, login cluster on the right.
// Renders the `<header>` element directly rather than wrapping the two-slot
// `PageHeader` primitive: the cross-tool nav strip is a third slot only this
// surface needs, and `PageHeader` stays the simple primitive that anywhere
// else can consume.
export function AppHeader({
  session,
  showAdminLink,
}: {
  session: Session | null;
  showAdminLink: boolean;
}) {
  return (
    <header className="flex items-stretch gap-3 px-6 h-11 text-body border-b border-border bg-section">
      <div className="flex items-center shrink-0">
        <Link
          href="/"
          className="font-jb font-extrabold text-[14px] tracking-[0.04em] uppercase text-name inline-flex items-center"
        >
          <span className="text-isk">[</span>
          <span className="px-[2px]">LGI</span>
          <span className="text-isk">]</span>
          <span className="text-muted font-normal">.tools</span>
        </Link>
      </div>
      <NavTools />
      <div className="ml-auto flex items-center shrink-0">
        <LoginButton session={session} showAdminLink={showAdminLink} />
      </div>
    </header>
  );
}
