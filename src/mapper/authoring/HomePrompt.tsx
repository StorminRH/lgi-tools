'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { TerminalSearch } from '@/components/ui/terminal-search';
import {
  useSystemSearch,
  type SystemErr,
  type SystemParams,
} from '@/components/use-system-search';

/** Props for the empty-map home-system prompt. */
export interface HomePromptProps {
  readonly mapId: string;
  readonly onPick: (systemId: number) => void;
}

/**
 * Centered empty-map prompt: system search plus a disabled "Use current system"
 * control annotated as requiring live tracking (4.0.4.2). Renders only when the
 * host has already gated on `canEdit` and a complete empty systems page.
 */
export function HomePrompt({ mapId, onPick }: HomePromptProps) {
  const { parse, suggest } = useSystemSearch();
  const titleId = useId();

  return (
    <div
      data-map-home-prompt
      data-map-id={mapId}
      className="pointer-events-none absolute inset-0 z-sticky flex items-center justify-center px-6"
    >
      <section
        aria-labelledby={titleId}
        className="pointer-events-auto flex w-full max-w-md flex-col gap-4 border border-border-idle bg-bg-deep p-5 shadow-dd"
      >
        <div className="flex flex-col gap-1">
          <p className="font-data text-label uppercase tracking-eyebrow text-muted">
            Atlas · new map
          </p>
          <h2
            id={titleId}
            className="font-display text-title font-bold tracking-copy text-name"
          >
            Set your home system
          </h2>
          <p className="text-ui leading-relaxed text-muted">
            The first system becomes the map root. Connections grow from here.
          </p>
        </div>
        <TerminalSearch<SystemParams, SystemErr>
          initialValue=""
          placeholder="Search systems — type a name"
          parse={parse}
          suggest={suggest}
          errorMessage={() => 'No system matches that name.'}
          onSubmit={(params) => onPick(params.system.id)}
          onClear={() => undefined}
          errorLabel="System"
        />
        <Button
          type="button"
          variant="secondary"
          disabled
          data-map-home-current-disabled
          className="flex h-auto w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
        >
          <span className="font-ui text-nav">Use current system</span>
          <span className="font-data text-micro text-faint">
            Requires live tracking · arrives in 4.0.4.2
          </span>
        </Button>
      </section>
    </div>
  );
}
