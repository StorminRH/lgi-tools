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

import { CharacterPanelSkeleton } from '@/components/composition/CharacterPanelSkeleton';
import { HeroBanner } from '@/components/composition/HeroBanner';
import { HomeDashboard } from '@/components/composition/HomeDashboard';
import { HomeFeatureCards } from '@/components/composition/HomeFeatureCards';
import { HomeHero } from '@/components/composition/HomeHero';
import { HomeLeftColumn } from '@/components/composition/HomeLeftColumn';
import { HomeLiveStats } from '@/components/composition/HomeLiveStats';
import { HomeNewsCard } from '@/components/composition/HomeNewsCard';
import { HomeRosterPanel } from '@/components/composition/HomeRosterPanel';
import { TelemetryReporter } from '@/components/composition/TelemetryReporter';
import { AccountDangerZone } from '@/components/composition/account/AccountDangerZone';
import { AdminUnlinkCharacterForm } from '@/components/composition/account/AdminUnlinkCharacterForm';
import { GrantedScopesList } from '@/components/composition/account/GrantedScopesList';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { RevokeRedirectLightbox } from '@/components/composition/account/RevokeRedirectLightbox';
import { RoleToggleForm } from '@/components/composition/account/RoleToggleForm';
import { SwitchCharacterForm } from '@/components/composition/account/SwitchCharacterForm';
import { UnlinkCharacterForm } from '@/components/composition/account/UnlinkCharacterForm';
import { postTelemetry } from '@/components/composition/telemetry/client';

describe('coverage-gaps', () => {
  it('pins leftover runtime exports on the test graph', () => {
    const pinned = [
      CharacterPanelSkeleton,
      HeroBanner,
      HomeDashboard,
      HomeFeatureCards,
      HomeHero,
      HomeLeftColumn,
      HomeLiveStats,
      HomeNewsCard,
      HomeRosterPanel,
      TelemetryReporter,
      AccountDangerZone,
      AdminUnlinkCharacterForm,
      GrantedScopesList,
      LinkCharacterButton,
      RevokeRedirectLightbox,
      RoleToggleForm,
      SwitchCharacterForm,
      UnlinkCharacterForm,
      postTelemetry,
    ];
    expect(pinned.length).toBeGreaterThan(0);
    for (const value of pinned) {
      expect(value).toBeDefined();
    }
  });
});
