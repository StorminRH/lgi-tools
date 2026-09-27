'use client';

import { type Ref, type RefObject, ViewTransition } from 'react';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import type { BoardCharacter, SkillCatalogGroup } from '@/composition/board/api-contract';
import { BoardLeaders } from './BoardLeaders';
import { reconnectSentence } from './board-view-model';

// Sheet parts wait for the portrait to land on open and leave before it
// moves back on close; the delays live in HomeBoardView.css. React only runs
// enter and exit on a <ViewTransition> with no new DOM node above it, so each
// part is a direct child of HomeBoardView's persistent container, which takes
// the sheet's grid layout while a character is shown.
const SHEET_MOTION = {
  enter: { 'board-open': 'board-sheet-in', default: 'none' },
  exit: { 'board-close': 'board-sheet-out', default: 'none' },
} as const;
const PANEL_MOTION = {
  enter: { 'board-open': 'board-panels-in', default: 'none' },
  exit: { 'board-close': 'board-sheet-out', default: 'none' },
} as const;
import { AttributesSection } from './sections/AttributesSection';
import { ClonesSection } from './sections/ClonesSection';
import { IndustrySection } from './sections/IndustrySection';
import { QueueSection } from './sections/QueueSection';
import { SheetHeader } from './sections/SheetHeader';
import { SkillsSection } from './sections/SkillsSection';
import { WalletSection } from './sections/WalletSection';

export function CharacterDetail({
  rootRef,
  backRef,
  character,
  catalog,
  names,
  now,
  onBack,
}: {
  rootRef: RefObject<HTMLElement | null>;
  backRef: Ref<HTMLButtonElement>;
  character: BoardCharacter;
  catalog: readonly SkillCatalogGroup[];
  names: Readonly<Record<string, string>>;
  now: number;
  onBack: () => void;
}) {
  const sentence = reconnectSentence(character);

  return (
    <>
      <ViewTransition {...SHEET_MOTION} default="none">
        <div className="xl:col-span-2">
          <Button
            ref={backRef}
            variant="bare"
            onClick={onBack}
            className="gap-2 rounded-ctl py-1 font-data text-ui text-muted hover:text-isk"
          >
            <span aria-hidden>←</span> All characters
          </Button>
          {sentence !== null && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Callout label="Reconnect" className="min-w-0 flex-1 text-ui">
                {sentence}
              </Callout>
              <LinkCharacterButton label="Reconnect" emphasis="reconnect" callbackURL="/" />
            </div>
          )}
        </div>
      </ViewTransition>
      <ViewTransition {...SHEET_MOTION} default="none">
        <SheetHeader character={character} now={now} />
      </ViewTransition>
      <ViewTransition {...PANEL_MOTION} default="none">
        {/* DOM order is the phone order; the empty 1fr row soaks up the wallet's extra height. */}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-[auto_auto_auto_auto_1fr_auto]">
          <QueueSection section={character.skills} names={names} now={now} className="lg:col-start-1 lg:row-start-1" />
          <WalletSection
            wallet={character.wallet}
            journal={character.journal}
            now={now}
            className="lg:col-start-2 lg:row-span-5 lg:row-start-1"
          />
          <AttributesSection
            attributes={character.attributes}
            implants={character.implants}
            now={now}
            className="lg:col-start-1 lg:row-start-2"
          />
          <ClonesSection section={character.clones} now={now} className="lg:col-start-1 lg:row-start-3" />
          <IndustrySection section={character.industry} now={now} className="lg:col-start-1 lg:row-start-4" />
          <SkillsSection section={character.skills} catalog={catalog} className="lg:col-span-2 lg:row-start-6" />
        </div>
      </ViewTransition>
      <ViewTransition exit={SHEET_MOTION.exit} default="none">
        <BoardLeaders rootRef={rootRef} />
      </ViewTransition>
    </>
  );
}
