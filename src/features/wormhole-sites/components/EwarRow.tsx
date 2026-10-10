import { Pill } from '@/components/ui/pill';
import { LabeledChipRow } from '@/components/ui/row';
import { EWAR_LABEL, EWAR_ORDER, EWAR_TONE } from './wormhole-styles';

export function EwarRow({
  web,
  scram,
  neut,
  rr,
}: {
  web: number | null;
  scram: number | null;
  neut: number | null;
  rr: number | null;
}) {
  const counts = { web, scram, neut, rr };
  const active = EWAR_ORDER.filter((k) => (counts[k] ?? 0) !== 0);
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
