import Link from 'next/link';
import { PageFooter } from '@/components/ui/page-footer';
import { APP_VERSION } from '@/config/app-version';

export function Footer() {
  return (
    <PageFooter
      className="pr-[150px]"
      left={
        <span className="block max-w-[720px] text-muted tracking-[0.03em] leading-[1.7]">
          Lo-Gang Industries — EVE Online and all related marks are property of Fenris Creations.
          LGI.tools is an independent third-party tool, not affiliated with or endorsed by Fenris
          Creations.
        </span>

      }
      right={
        <span className="inline-flex items-center gap-4 tracking-[0.03em]">
          <Link href="/legal" className="text-muted">
            Privacy
          </Link>

          <Link href="/contact" className="text-muted">
            Contact
          </Link>

          <Link href="/changelog" className="text-muted">
            Changelog
          </Link>

          <span className="text-faint">v{APP_VERSION}</span>

        </span>

      }
    />
  );
}
