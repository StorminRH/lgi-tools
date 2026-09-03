import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export function NotFoundContent() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-20 gap-8 text-center">
      <div className="flex flex-col items-center gap-3 max-w-[640px]">
        <div className="font-data text-label text-muted tracking-eyebrow uppercase">
          404 · Signature lost
        </div>
        <h1 className="font-display font-bold text-hero leading-none tracking-copy uppercase text-name">
          Nothing on D-Scan
        </h1>
        <p className="text-body text-text leading-relaxed">
          The page you&apos;re looking for isn&apos;t in this system&apos;s overview. The
          link may be stale, or you may have wandered off the star map.
        </p>
      </div>

      <Link href="/" className={buttonVariants()}>
        Warp to home
      </Link>
    </div>
  );
}
