import Link from 'next/link';
import { cn } from './cn';
import { Pill, type PillTone } from './pill';

export interface FilterOption {
  value: string | null;
  label: string;
  tone?: PillTone;
}

export function FilterBar({
  label,
  paramName,
  options,
  activeValue,
  basePath,
  currentParams,
}: {
  label: string;
  paramName: string;
  options: FilterOption[];
  activeValue: string | null;
  basePath: string;
  currentParams: Record<string, string | undefined>;
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-muted w-12 shrink-0">
        {label}
      </span>
      {options.map((opt) => {
        const isActive = (opt.value ?? null) === (activeValue ?? null);

        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(currentParams)) {
          if (k !== paramName && v) params.set(k, v);
        }
        if (opt.value) params.set(paramName, opt.value);
        const qs = params.toString();
        const href = qs ? `${basePath}?${qs}` : basePath;

        return (
          <Link
            key={opt.value ?? 'all'}
            href={href}
            scroll={false}
            className={cn(
              'transition-opacity',
              isActive ? 'opacity-100' : 'opacity-45 hover:opacity-90',
            )}
          >
            <Pill tone={isActive ? (opt.tone ?? 'neutral') : 'neutral'}>{opt.label}</Pill>
          </Link>
        );
      })}
    </div>
  );
}
