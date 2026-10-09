import { ReadoutRow } from '@/components/ui/readout';
import type { StatusLine } from './signals';
import { levelReadout } from './status-tone';

/** One status line as a readout row: its level draws the dot, speaks the verdict and colours a problem value. */
export function LevelRow({ line }: { line: StatusLine }) {
  return <ReadoutRow label={line.label} value={line.value} note={line.note} {...levelReadout(line.level)} />;
}
