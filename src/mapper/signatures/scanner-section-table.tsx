'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { ScannerEstIskCell } from '@/features/wormhole-sites/widget';
import type { OriginLeadConnection } from '../authoring/leads-to-origin';
import { mapFrostedSurface } from '../map-frosted-surface';
import { ScannerIdentifyCombo } from './scanner-identify-combo';
import {
  IdCell,
  NameCell,
  SignatureRow,
  SiteTypeCell,
} from './scanner-row-cells';
import {
  useWormholeCellContext,
  wormholeCells,
  type WormholeCellContext,
} from './scanner-wormhole-cells';
import {
  groupSignatureSections,
  type ScannerSection,
  type ScannerSectionId,
  type SignatureWindowRow,
} from './signature-model';
import { scannerRowShowsOpenAffordance } from './scanner-row-open';

const SECTION_COLUMNS: Readonly<Record<ScannerSectionId, string>> = {
  unknown:
    'grid w-full min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2.5 [&>*]:min-w-0',
  wormholes:
    'grid w-full min-w-0 grid-cols-[4.25rem_minmax(0,4.75rem)_minmax(0,4rem)_minmax(0,3.5rem)_minmax(0,1fr)] items-center gap-2.5 [&>*]:min-w-0',
  combat:
    'grid w-full min-w-0 grid-cols-[4.25rem_minmax(0,1fr)_3.6rem] items-center gap-2.5 [&>*]:min-w-0',
  harvestables:
    'grid w-full min-w-0 grid-cols-[4.25rem_3.75rem_minmax(0,1fr)_3.6rem] items-center gap-2.5 [&>*]:min-w-0',
  hacking:
    'grid w-full min-w-0 grid-cols-[4.25rem_3.75rem_minmax(0,1fr)] items-center gap-2.5 [&>*]:min-w-0',
};

function sectionCells(
  sectionId: ScannerSectionId,
  row: SignatureWindowRow,
  ctx: WormholeCellContext,
): ReactNode {
  switch (sectionId) {
    case 'unknown':
      return (
        <>
          <IdCell row={row} now={ctx.now} />
          {ctx.canEdit && row.group === null && ctx.onIdentify !== undefined ? (
            <ScannerIdentifyCombo
              codes={ctx.codes}
              preferredCodes={ctx.preferredCodes}
              classLabelOf={ctx.classLabelOf}
              rowId={row.signatureId}
              disabled={false}
              onIdentify={(group, code) => ctx.onIdentify?.(row, group, code)}
            />
          ) : (
            <NameCell row={row} />
          )}
        </>
      );
    case 'wormholes':
      return wormholeCells(row, ctx);
    case 'combat':
      return (
        <>
          <IdCell row={row} now={ctx.now} />
          <NameCell row={row} />
          <ScannerEstIskCell siteName={row.name} live={false} />
        </>
      );
    case 'harvestables':
      return (
        <>
          <IdCell row={row} now={ctx.now} />
          <SiteTypeCell row={row} />
          <NameCell row={row} />
          <ScannerEstIskCell siteName={row.name} live />
        </>
      );
    case 'hacking':
      return (
        <>
          <IdCell row={row} now={ctx.now} />
          <SiteTypeCell row={row} />
          <NameCell row={row} />
        </>
      );
  }
}

function sectionHeaders(sectionId: ScannerSectionId): readonly string[] {
  switch (sectionId) {
    case 'unknown':
      return ['ID', 'Name'];
    case 'wormholes':
      return ['ID', 'Type', 'Mass', 'Life', 'Destination'];
    case 'combat':
      return ['ID', 'Name', 'Est. ISK'];
    case 'harvestables':
      return ['ID', 'Type', 'Name', 'Est. ISK'];
    case 'hacking':
      return ['ID', 'Type', 'Name'];
  }
}

function ColumnHeader({
  columnsClassName,
  labels,
}: {
  readonly columnsClassName: string;
  readonly labels: readonly string[];
}) {
  return (
    <div
      aria-hidden
      className={cn(
        columnsClassName,
        'px-2.5 font-ui text-label font-medium uppercase tracking-label text-muted',
      )}
    >
      {labels.map((label) => (
        <span key={label} className="w-full text-center">
          {label}
        </span>
      ))}
    </div>
  );
}

function ScannerSectionBlock({
  section,
  missingIds,
  canEdit,
  resolveSiteId,
  cells,
  onIdentify,
  onOpenActions,
}: {
  readonly section: ScannerSection;
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly resolveSiteId: (name: string) => number | null;
  readonly cells: (row: SignatureWindowRow) => ReactNode;
  readonly onIdentify?: WormholeCellContext['onIdentify'];
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  const columnsClassName = SECTION_COLUMNS[section.id];
  return (
    <section
      data-scanner-section={section.id}
      className={cn(mapFrostedSurface, 'min-w-0 max-w-full')}
    >
      <Collapsible
        defaultOpen
        className="border-0"
        headerClassName="border-0 px-2.5 py-1.5 hover:bg-transparent"
        header={
          <span className="flex w-full items-center gap-2">
            <span
              data-chevron
              aria-hidden
              className="inline-block shrink-0 text-micro text-muted transition-transform"
            >
              ▾
            </span>
            <span className="font-ui text-label font-semibold uppercase tracking-label text-muted">
              {section.title}
            </span>
            <span
              data-scanner-section-count
              className="ml-auto rounded-ctl bg-bg-deep px-1.5 font-ui text-micro text-muted"
            >
              {section.rows.length}
            </span>
          </span>
        }
      >
        <div data-scanner-section-body className="flex flex-col pb-1">
          <ColumnHeader
            columnsClassName={columnsClassName}
            labels={sectionHeaders(section.id)}
          />
          <ul className="flex flex-col divide-y divide-border-soft">
            {section.rows.map((row) => {
              const inlineWormhole =
                section.id === 'wormholes' &&
                row.connection !== null &&
                canEdit;
              const inlineIdentify =
                section.id === 'unknown'
                && canEdit
                && row.group === null
                && onIdentify !== undefined;
              return (
                <SignatureRow
                  key={row.key}
                  row={row}
                  missing={missingIds.has(row.signatureId)}
                  canEdit={canEdit}
                  resolveSiteId={resolveSiteId}
                  columnsClassName={columnsClassName}
                  cells={cells(row)}
                  showOpenAffordance={
                    !inlineWormhole &&
                    !inlineIdentify &&
                    scannerRowShowsOpenAffordance(row, canEdit, resolveSiteId)
                  }
                  onOpenActions={(trigger, clientX, clientY) =>
                    onOpenActions(row, trigger, clientX, clientY)
                  }
                />
              );
            })}
          </ul>
        </div>
      </Collapsible>
    </section>
  );
}

function ScannerRowsLoading() {
  return (
    <p
      data-signature-empty
      className="px-3 py-4 text-center font-ui text-ui text-muted"
    >
      Reading scanner rows…
    </p>
  );
}

export function ScannerSections({
  rows,
  scannerSystemId,
  missingIds,
  canEdit,
  resolveSiteId,
  complete,
  now,
  bindConnectionSetters,
  originLeadConnections,
  onIdentify,
  onOpenActions,
}: {
  readonly rows: readonly SignatureWindowRow[];
  readonly scannerSystemId: number | null;
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly resolveSiteId: (name: string) => number | null;
  readonly complete: boolean;
  readonly now: number;
  readonly bindConnectionSetters?: WormholeCellContext['bindConnectionSetters'];
  readonly originLeadConnections: readonly OriginLeadConnection[];
  readonly onIdentify?: WormholeCellContext['onIdentify'];
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  const ctx = useWormholeCellContext({
    scannerSystemId,
    now,
    canEdit,
    bindConnectionSetters,
    originLeadConnections,
    onIdentify,
  });
  const sections = groupSignatureSections(rows, scannerSystemId);
  if (sections.length === 0) {
    return complete ? null : <ScannerRowsLoading />;
  }
  return (
    <div data-scanner-sections className="flex flex-col gap-2.5">
      {sections.map((section) => (
        <ScannerSectionBlock
          key={section.id}
          section={section}
          missingIds={missingIds}
          canEdit={canEdit}
          resolveSiteId={resolveSiteId}
          cells={(row) => sectionCells(section.id, row, ctx)}
          onIdentify={onIdentify}
          onOpenActions={onOpenActions}
        />
      ))}
    </div>
  );
}
