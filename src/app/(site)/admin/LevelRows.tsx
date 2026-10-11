import { levelReadout } from '@/components/status-level-tone';
import { ReadoutList, ReadoutRow } from '@/components/ui/readout';
import type { StatusLine } from './signals';

/**
 * Status lines as readout rows: each line's level draws its dot, speaks the
 * verdict and colours a problem value.
 */
export function LevelRows({ lines }: { lines: StatusLine[] }) {
  return (
    <ReadoutList>
      {lines.map((line) => (
        <ReadoutRow key={line.id} label={line.label} value={line.value} note={line.note} {...levelReadout(line.level)} />
      ))}
    </ReadoutList>
  );
}
