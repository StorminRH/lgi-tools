import { Chip } from '@/components/ui/chip';
import { LabeledChipRow } from '@/components/ui/row';
import { EWAR_LABEL, EWAR_ORDER, EWAR_TONE } from './wormhole-styles';

/**
 * The four ewar fields on a Wave row are nullable integer NPC-counts; treat
 * anything \> 0 as "present" and render a chip for it.
 */

/** Renders one site's electronic-warfare effects using canonical labels and semantic tones. */
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
        <Chip key={k} tone={EWAR_TONE[k]}>
          {EWAR_LABEL[k]}
        </Chip>
      ))}
    </LabeledChipRow>
  );
}
