import { EveImage } from '@/components/eve-image';
import { Pill } from '@/components/ui/pill';
import type { CodexAssetView } from '../assets';
import type { CodexNodeAttrs } from '../nodes';

const FRAME = 'relative overflow-hidden rounded-card border border-border bg-bg-deep shadow-card-edge';

export function CodexImageFigure({
  attrs,
  asset,
}: {
  attrs: CodexNodeAttrs<'image'>;
  asset: CodexAssetView | undefined;
}) {
  if (!asset) {
    return (
      <figure className="m-0" data-codex-image-missing="">
        <div className={`${FRAME} flex aspect-[16/9] items-center justify-center font-ui text-ui text-muted`}>
          Image unavailable
        </div>
      </figure>
    );
  }
  return (
    <figure className="m-0">
      <div className={FRAME}>
        <EveImage
          source="codex"
          src={asset.stem}
          alt={attrs.alt}
          width={asset.width}
          height={asset.height}
          sizes="(min-width: 1024px) 760px, 100vw"
          className="block h-auto w-full"
        />
        <span className="absolute left-3 top-3 flex rounded-full bg-bg-deep">
          <Pill tone="neutral">{asset.status === 'pending' ? 'Screenshot · awaiting review' : 'Screenshot'}</Pill>
        </span>
      </div>
      <figcaption className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-ui text-ui text-muted">
        <span className="text-text">{attrs.caption}</span>
        {asset.credit ? <span className="text-faint">Screenshot by {asset.credit}</span> : null}
      </figcaption>
    </figure>
  );
}
