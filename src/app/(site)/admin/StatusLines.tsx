import { cn } from '@/components/ui/cn';
import { Dot } from '@/components/ui/dot';
import type { StatusLine } from './signals';
import { LEVEL_DOT_TONE, LEVEL_VALUE_CLASS } from './status-tone';

function StatusLineRow({ line, plain }: { line: StatusLine; plain: boolean }) {
  return (
    <li className="flex items-start gap-3 border-b border-border-soft px-3.5 py-2.5 last:border-b-0">
      {plain ? null : <Dot tone={LEVEL_DOT_TONE[line.level]} size="lg" className="mt-1.5" />}
      <span className="min-w-0 flex-1">
        <span className="block font-ui text-ui text-text">{line.label}</span>
        <span className="block truncate font-data text-micro text-muted">{line.note}</span>
      </span>
      <span className={cn('shrink-0 text-right font-data text-ui tabular-nums', LEVEL_VALUE_CLASS[line.level])}>
        {line.value}
      </span>
    </li>
  );
}

// `plain` drops the status dots for lists of figures that carry no verdict.
export function StatusLines({ lines, plain = false }: { lines: StatusLine[]; plain?: boolean }) {
  return (
    <ul>
      {lines.map((line) => (
        <StatusLineRow key={line.id} line={line} plain={plain} />
      ))}
    </ul>
  );
}
