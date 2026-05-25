import type { ReactNode } from 'react';
import { cn } from './cn';
import type { PillTone } from './tones';

export type { PillTone };

const TONE: Record<PillTone, string> = {
  neutral:      'bg-[#161e28] text-[#506070] border-[#1e2c3a]',
  green:        'bg-[#0f2218] text-[#3dd68c] border-[#1a3a28] font-semibold',
  'green-strong':'bg-[#0f2218] text-[#44dd99] border-[#1a3a28] font-semibold',
  orange:       'bg-[#1f1508] text-[#d68c3d] border-[#3a2510] font-semibold',
  'orange-soft':'bg-[#1a0f0a] text-[#cc7733] border-[#3a2010]',
  red:          'bg-[#1a0a0a] text-[#dd4444] border-[#3a1010] font-semibold',
  'red-soft':   'bg-[#1a1010] text-[#cc5555] border-[#3a1515]',
  magenta:      'bg-[#1a0a1a] text-[#cc55cc] border-[#3a103a] font-semibold',
  purple:       'bg-[#100a1a] text-[#aa55ff] border-[#2a1040] font-semibold',
  yellow:       'bg-[#1a1a0a] text-[#ccaa33] border-[#332e10]',
  teal:         'bg-[#0a1a14] text-[#33cc88] border-[#104a2a]',
  blue:         'bg-[#0a101a] text-[#3399cc] border-[#10283a]',
};

export function Pill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-mono text-[10px] font-medium px-[7px] py-[2px] rounded-[2px] tracking-[0.05em] border inline-flex items-center',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
