'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { insetSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { displayTitle } from '@/components/ui/type-roles';
import { useConfirmGate } from '@/components/ui/use-confirm-gate';
import type { MapBlockOption } from '@/data/maps/access-contract';
import type { AccessPrincipalOption } from './access-editor-model';
import { CharacterSearchControl } from './CharacterSearchControl';
import {
  blockedPrincipals,
  mapBlockRevision,
  withBlock,
  withoutBlock,
} from './map-block-model';
import { useMapAccessWrite, useServerDraft } from './use-map-access-editor';

export function useMapBlockEditor(mapId: string, initialBlocks: readonly MapBlockOption[]) {
  const [blocks, setBlocks] = useServerDraft(
    initialBlocks,
    mapBlockRevision(initialBlocks),
    (server): MapBlockOption[] => [...server],
  );
  const write = useMapAccessWrite<true>();

  return {
    blocks,
    busy: write.busy !== null,
    error: write.error,
    block: (block: MapBlockOption) =>
      write.run(
        true,
        { operation: 'block', mapId, characterId: block.characterId },
        () => setBlocks((current) => withBlock(current, block)),
      ),
    unblock: (characterId: number) =>
      write.run(
        true,
        { operation: 'unblock', mapId, characterId },
        () => setBlocks((current) => withoutBlock(current, characterId)),
      ),
  };
}

export type MapBlockEditor = ReturnType<typeof useMapBlockEditor>;

export function MapBlockList({
  editor,
  disabled,
}: {
  readonly editor: MapBlockEditor;
  readonly disabled: boolean;
}) {
  const blockConfirm = useConfirmGate<AccessPrincipalOption>();

  return (
    <section className="flex flex-col gap-2" aria-labelledby="map-blocked-pilots" data-map-block-list>
      <h3 id="map-blocked-pilots" className={displayTitle({ size: 'nav' })}>
        Blocked pilots
      </h3>
      <p className="font-ui text-label text-faint">
        A blocked pilot can&apos;t see or track this map, even if the access list includes them.
      </p>
      <CharacterSearchControl
        label="Block character"
        disabled={disabled}
        selectedPrincipals={blockedPrincipals(editor.blocks)}
        onSelect={blockConfirm.request}
      />
      {editor.blocks.length === 0 ? (
        <p className="font-ui text-ui text-muted">Nobody is blocked.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {editor.blocks.map((block) => (
            <div
              key={block.characterId}
              className={cn(insetSurface, 'flex items-center gap-2 px-3 py-2.5')}
              data-map-blocked-character={block.characterId}
            >
              <CharacterPortrait
                characterId={block.characterId}
                name={block.name}
                size={32}
              />
              <p className="min-w-0 flex-1 truncate font-ui text-ui text-text">{block.name}</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => void editor.unblock(block.characterId)}
              >
                Unblock
              </Button>
            </div>
          ))}
        </div>
      )}
      {editor.error !== null ? <Banner tone="warn">{editor.error}</Banner> : null}
      <ConfirmDialog
        open={blockConfirm.open}
        onOpenChange={(open) => {
          if (!open) blockConfirm.cancel();
        }}
        title="Block pilot?"
        consequence={
          blockConfirm.target === null
            ? ''
            : `Blocking removes ${blockConfirm.target.name} and every other character on their LGI.tools account from this map.`
        }
        busy={false}
        confirmLabel="Block"
        onConfirm={() => {
          const pilot = blockConfirm.target;
          if (pilot !== null) void editor.block({ characterId: pilot.ownerId, name: pilot.name });
          blockConfirm.reset();
        }}
      />
    </section>
  );
}
