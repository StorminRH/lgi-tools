import { Pill } from '@/components/ui/pill';
import { LabeledChipRow } from '@/components/ui/row';
import { activeEwarKeys, type EwarCounts } from '../ewar';
import { EWAR_LABEL, EWAR_TONE } from './wormhole-styles';

export function EwarRow({ counts }: { counts: EwarCounts }) {
  const active = activeEwarKeys(counts);
  if (active.length === 0) return null;
  return (
    <LabeledChipRow label="EWAR">
      {active.map((k) => (
        <Pill key={k} tone={EWAR_TONE[k]} className="shrink-0">
          {EWAR_LABEL[k]}
        </Pill>
      ))}
    </LabeledChipRow>
  );
}
