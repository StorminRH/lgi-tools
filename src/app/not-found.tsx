import Link from 'next/link';
import { Pill } from '@/components/ui/pill';

export const metadata = {
  title: 'Not found',
};

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-20 gap-8 text-center">
      <header className="flex flex-col items-center gap-3 max-w-[640px]">
        <div className="font-mono text-[10px] text-muted tracking-[0.18em] uppercase">
          404 · Signature lost
        </div>
        <h1 className="font-display font-bold text-[48px] sm:text-[64px] leading-none tracking-[0.04em] uppercase text-name">
          Nothing on D-Scan
        </h1>
        <p className="text-[13px] text-text leading-relaxed">
          The page you&apos;re looking for isn&apos;t in this system&apos;s overview. The
          link may be stale, or you may have wandered off the star map.
        </p>
      </header>

      <Link href="/" className="inline-flex">
        <Pill tone="green">Warp to home</Pill>
      </Link>
    </div>
  );
}
