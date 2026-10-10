import type { BoardCharacter, PlaceRef } from '@/composition/board/api-contract';
import { EntityRow } from '@/components/ui/row';
import { formatCount } from '@/lib/format/number';
import { formatUtcDate } from '@/lib/format/time';
import { placeName } from '../board-view-model';
import { SystemName } from '../board-bits';
import { SectionBody, SectionPanel } from '../SectionBody';

export function ClonesSection({
  section,
  className,
}: {
  section: BoardCharacter['clones'];
  className?: string;
}) {
  return (
    <SectionPanel title="Clones" className={className}>
      <SectionBody section={section}>
        {(clones) => (
          <div className="pb-1">
            <div className="flex flex-col gap-0.5 px-3.5 py-2.5">
              <span className="text-micro uppercase tracking-wide text-muted">Home station</span>
              {clones.home !== null ? <Place place={clones.home} /> : <span className="text-ui text-faint">Not set</span>}
              <span className="font-data text-micro text-muted">
                Last clone jump {clones.lastJumpDate !== null ? formatUtcDate(clones.lastJumpDate) : 'never'}
              </span>
            </div>
            {clones.jumpClones.length === 0 ? (
              <p className="border-t border-border-soft px-3.5 py-2 text-ui text-faint">No jump clones.</p>
            ) : (
              clones.jumpClones.map((clone) => (
                <EntityRow
                  key={clone.id}
                  colsClass="grid-cols-[minmax(0,1fr)_auto]"
                  name={<Place place={clone.location} label={clone.name} />}
                  trailing={
                    <span className="font-data text-micro text-muted">
                      {formatCount(clone.implantCount, 'implant')}
                    </span>
                  }
                />
              ))
            )}
          </div>
        )}
      </SectionBody>
    </SectionPanel>
  );
}

function Place({ place, label = null }: { place: PlaceRef; label?: string | null }) {
  return (
    <span className="flex min-w-0 flex-col text-ui">
      {label !== null && <span className="text-name">{label}</span>}
      <span className={label !== null ? 'truncate text-muted' : 'truncate text-name'}>{placeName(place)}</span>
      {place.system !== null && (
        <span className="text-micro">
          <SystemName system={place.system} />
        </span>
      )}
    </span>
  );
}
