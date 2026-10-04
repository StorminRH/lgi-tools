import { cn } from '@/components/ui/cn';

const GLYPH_MASK = {
  me: 'mask-[url(/icons/ccp/industry-me.png)]',
  te: 'mask-[url(/icons/ccp/industry-te.png)]',
  runs: 'mask-[url(/icons/ccp/industry-runs.png)]',
} as const;

/** One of CCP's white industry glyphs, painted in the current text colour through a mask. */
export function IndustryGlyph({ glyph, className }: { glyph: keyof typeof GLYPH_MASK; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block size-full bg-current mask-contain mask-center mask-no-repeat', GLYPH_MASK[glyph], className)}
    />
  );
}
