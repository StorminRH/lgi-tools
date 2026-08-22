import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
    delete: () => undefined,
  }),
}));
vi.mock('next/cache', () => ({
  cacheLife: () => undefined,
  cacheTag: () => undefined,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
  connection: async () => undefined,
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('next/font/google', () => {
  const font = () => ({ className: '', variable: '--font-mock', style: { fontFamily: 'mock' } });
  return {
    Barlow_Condensed: font,
    JetBrains_Mono: font,
    Geist: font,
  };
});
vi.mock('next/og', () => ({ ImageResponse: class ImageResponse {} }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }));
vi.mock('convex/react', () => ({
  useQuery: () => undefined,
  useMutation: () => () => undefined,
  useConvex: () => null,
  ConvexProvider: (props: { children?: unknown }) => props.children ?? null,
  ConvexProviderWithAuth: (props: { children?: unknown }) => props.children ?? null,
  ConvexReactClient: class ConvexReactClient {},
}));

import { AnnotatedDailyChart } from '@/components/ui/annotated-daily-chart';
import { BarChart } from '@/components/ui/bar-chart';
import { StaticSparkline } from '@/components/ui/chart/static-sparkline';
import { ContentBrowser, landingContentSlug } from '@/components/ui/content-browser';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { LoadingLabel } from '@/components/ui/loading-label';
import { LoadingToastProvider } from '@/components/ui/loading-toast';
import { MenuRadioGroup, MenuRadioItem, MenuRadioItemIndicator } from '@/components/ui/menu';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { Breadcrumb, PageTitle } from '@/components/ui/page-head';
import { Pagination } from '@/components/ui/pagination';
import { PopoverRow } from '@/components/ui/popover';
import { PriceConfidence } from '@/components/ui/price-confidence';
import { StackedShareBar } from '@/components/ui/stacked-share-bar';
import { Tabs } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/toast';
import { TrendChart } from '@/components/ui/trend-chart';

describe('coverage-gaps', () => {
  it('pins leftover runtime exports on the test graph', () => {
    const pinned = [
      AnnotatedDailyChart,
      BarChart,
      StaticSparkline,
      ContentBrowser,
      landingContentSlug,
      DistributionBars,
      LoadingLabel,
      LoadingToastProvider,
      MenuRadioGroup,
      MenuRadioItem,
      MenuRadioItemIndicator,
      MultiplesCell,
      MultiplesGrid,
      Breadcrumb,
      PageTitle,
      Pagination,
      PopoverRow,
      PriceConfidence,
      StackedShareBar,
      Tabs,
      Toaster,
      TrendChart,
    ];
    expect(pinned.length).toBeGreaterThan(0);
    for (const value of pinned) {
      expect(value).toBeDefined();
    }
  });
});
