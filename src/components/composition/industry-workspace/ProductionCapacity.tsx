'use client';

import { EveImage } from '@/components/eve-image';
import type { JobCategory } from '@/features/industry-jobs/industry-jobs-styles';
import { StatFigure } from '../board/board-bits';
import { SectionPanel } from '../board/SectionBody';
import { type MemberCapacity, type PoolSummary, poolSummaries, type RailMember, SLOT_POOLS } from './workspace-model';

const LABELS: Record<JobCategory, string> = {
  manufacturing: 'Manufacturing',
  reactions: 'Reactions',
  science: 'Science',
};

function capacityCount(pool: PoolSummary): string {
  const used = pool.unknownUsed > 0 ? '?' : String(pool.used);
  const total = pool.unknownCapacity === 0
    ? String(pool.capacity)
    : pool.capacity > 0 ? `${pool.capacity}+` : '?';
  return `${used}/${total}`;
}

/** The same slot pools, scoped to the profile's members or one open character. */
export function ProductionCapacity({
  members,
  capacities,
}: {
  members: readonly RailMember[];
  capacities: ReadonlyMap<number, MemberCapacity>;
}) {
  const linked = members.filter((member) => member.linked);
  const pools = poolSummaries(linked.map((member) => member.characterId), capacities);
  const unlinked = members.length - linked.length;
  const incomplete = SLOT_POOLS.some((pool) => pools[pool].unknownUsed > 0 || pools[pool].unknownCapacity > 0);
  return (
    <SectionPanel title="Production Capacity">
      {linked.length === 0 && unlinked > 0 ? (
        <p className="px-3.5 py-3 text-ui text-faint">Link a character in this selection to see its production capacity.</p>
      ) : (
        <dl aria-label="Production capacity" className="grid gap-x-8 gap-y-3 px-3.5 py-3 sm:grid-cols-3">
          {SLOT_POOLS.map((pool) => (
            <StatFigure
              key={pool}
              label={LABELS[pool]}
              value={
                <span className="flex items-center gap-2">
                  <EveImage
                    source="static"
                    src={`/icons/ccp/industry-${pool}.png`}
                    alt=""
                    width={32}
                    height={32}
                    className="size-6 shrink-0 object-contain"
                  />
                  <span>{capacityCount(pools[pool])}</span>
                </span>
              }
            />
          ))}
        </dl>
      )}
      {incomplete || unlinked > 0 ? (
        <p className="border-t border-border-soft px-3.5 py-2.5 text-micro text-faint">
          {incomplete ? '? = not yet known. + = additional capacity still syncing. ' : null}
          {unlinked > 0 ? `${unlinked} unlinked ${unlinked === 1 ? 'character is' : 'characters are'} excluded.` : null}
        </p>
      ) : null}
    </SectionPanel>
  );
}
