'use client';

import { useState } from 'react';
import { EveImage } from '@/components/eve-image';
import { Button } from '@/components/ui/button';
import type { CodexVideoEmbed } from '../video';
import { PlayIcon } from './icons';

const FRAME = 'relative aspect-[16/9] w-full overflow-hidden rounded-card border border-border bg-bg-deep shadow-card-edge';

export function VideoPlayer({ title, embedSrc }: { title: string; embedSrc: string }) {
  return (
    <div data-video-player="" className={FRAME}>
      <iframe
        ref={(element) => element?.focus()}
        src={embedSrc}
        aria-label={title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        className="absolute inset-0 size-full border-0"
      />
    </div>
  );
}

export function CodexVideo({ title, embed }: { title: string; embed: CodexVideoEmbed }) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="m-0">
      {playing ? (
        <VideoPlayer title={title} embedSrc={embed.embedSrc} />
      ) : (
        <Button
          variant="bare"
          aria-label={`Play ${title} (loads ${embed.label})`}
          className={`group block text-left ${FRAME}`}
          onClick={() => setPlaying(true)}
        >
          {embed.thumbnail ? (
            <EveImage
              source="static"
              src={embed.thumbnail}
              alt=""
              width={480}
              height={360}
              className="absolute inset-0 size-full object-cover opacity-60"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-ui text-h3 text-muted">Twitch</span>
          )}
          <span className="absolute inset-0 bg-linear-to-r from-bg-deep/90 via-bg-deep/55 to-bg-deep/20" />
          <span className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-isk/40 bg-isk/15 pl-1 text-isk shadow-float backdrop-blur-sm transition-[scale,background-color] ease-spring group-hover:scale-105 group-hover:bg-isk group-hover:text-isk-ink">
            <PlayIcon size={26} />
          </span>
          <span className="absolute inset-x-0 bottom-0 px-4 pb-3.5 font-ui text-h3 font-semibold leading-tight text-name">
            {title}
          </span>
        </Button>
      )}
      <figcaption className="mt-2.5 font-ui text-ui text-faint">
        {embed.label} video. Nothing loads from {embed.host} until you press play.
      </figcaption>
    </figure>
  );
}
