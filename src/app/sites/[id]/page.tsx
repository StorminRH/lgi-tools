import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import { overlayLivePrices } from '@/features/wormhole-sites/live-prices';
import { getSiteDetail } from '@/features/wormhole-sites/queries';

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();

  const raw = await getSiteDetail(id);
  if (!raw) notFound();

  const [site] = await overlayLivePrices([raw]);

  // Forward any active filter params so the back link returns to
  // the same filtered view the user was on before sharing.
  const qs = new URLSearchParams();
  if (typeof sp.type === 'string') qs.set('type', sp.type);
  if (typeof sp.class === 'string') qs.set('class', sp.class);
  const backHref = qs.toString() ? `/sites?${qs}` : '/sites';

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <div className="w-full max-w-[1100px] mb-6">
        <Link
          href={backHref}
          className="text-[10px] tracking-[0.12em] uppercase text-muted"
        >
          ← Return to full list
        </Link>
      </div>
      <div className="w-full max-w-[1100px]">
        <SiteCard site={site} defaultOpen />
      </div>
    </div>
  );
}
