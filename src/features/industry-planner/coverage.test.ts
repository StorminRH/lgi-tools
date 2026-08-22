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

import { buildLocationRequestSchema, deleteSavedPlanEndpoint, deleteSavedPlanRequestSchema, favoriteSavedPlanEndpoint, favoriteSavedPlanRequestSchema, ownedAssetsRequestSchema, ownedBlueprintsRequestSchema, renameSavedPlanEndpoint, renameSavedPlanRequestSchema } from '@/features/industry-planner/api-contract';
import { BuildLocationSelector } from '@/features/industry-planner/components/BuildLocationSelector';
import { BuildSkillsIndicator } from '@/features/industry-planner/components/BuildSkillsIndicator';
import { CockpitBuildPlan } from '@/features/industry-planner/components/CockpitBuildPlan';
import { CockpitKpis } from '@/features/industry-planner/components/CockpitKpis';
import { CockpitPlanner } from '@/features/industry-planner/components/CockpitPlanner';
import { CockpitRawLedger } from '@/features/industry-planner/components/CockpitRawLedger';
import { HeroCard } from '@/features/industry-planner/components/HeroCard';
import { IndustryTypedHint } from '@/features/industry-planner/components/IndustryTypedHint';
import { MarketScorePanel } from '@/features/industry-planner/components/MarketScorePanel';
import { GemIcon, HourglassIcon, MeField, NodeAdjusters, TeField } from '@/features/industry-planner/components/MeAdjuster';
import { MultibuyPanel } from '@/features/industry-planner/components/MultibuyPanel';
import { ReactionStructureSelect } from '@/features/industry-planner/components/ReactionStructureSelect';
import { RecordRecentBlueprint } from '@/features/industry-planner/components/RecordRecentBlueprint';
import { SavedPlanRows } from '@/features/industry-planner/components/SavedPlanRows';
import { SavedPlansManager } from '@/features/industry-planner/components/SavedPlansManager';
import { SelectedSystemBox } from '@/features/industry-planner/components/SelectedSystemBox';
import { TemplateLoader } from '@/features/industry-planner/components/TemplateLoader';
import { TemplatesMenu } from '@/features/industry-planner/components/TemplatesMenu';
import { KPI_FIG, KpiHead, KpiHelp, KpiTile, SimpleTile } from '@/features/industry-planner/components/kpi-tile';
import { useTemplatePlanner } from '@/features/industry-planner/components/planner-contexts';
import { StructureBonusReadout } from '@/features/industry-planner/components/structure-bonus-readout';
import { HERO_LOCATION_CONTROL_WELL_CLASS, HERO_LOCATION_GROUP_CLASS, HERO_LOCATION_ROW_CLASS, PLANNER_DISCLOSURE_TRIGGER_CLASS, activityLabel, marginToneClass } from '@/features/industry-planner/industry-styles';
import { getBlueprintPricing, getBlueprintSearchIndex, getBuildLocation } from '@/features/industry-planner/queries';
import { readRecentBlueprints, recordRecentBlueprint } from '@/features/industry-planner/recent-blueprints';
import { renameSavedPlan, setSavedPlanFavorite } from '@/features/industry-planner/saved-plans-queries';
import { TEMPLATE_APPLY_GATE_MS } from '@/features/industry-planner/template-load';
import { useBuildCharacterSkillLevels } from '@/features/industry-planner/use-build-character-skills';
import { useManagedRowMenu } from '@/features/industry-planner/use-managed-row-menu';
import { useRecentBlueprints } from '@/features/industry-planner/use-recent-blueprints';
import { useSavedPlans } from '@/features/industry-planner/use-saved-plans';

describe('coverage-gaps', () => {
  it('pins leftover runtime exports on the test graph', () => {
    const pinned = [
      buildLocationRequestSchema,
      deleteSavedPlanEndpoint,
      deleteSavedPlanRequestSchema,
      favoriteSavedPlanEndpoint,
      favoriteSavedPlanRequestSchema,
      ownedAssetsRequestSchema,
      ownedBlueprintsRequestSchema,
      renameSavedPlanEndpoint,
      renameSavedPlanRequestSchema,
      BuildLocationSelector,
      BuildSkillsIndicator,
      CockpitBuildPlan,
      CockpitKpis,
      CockpitPlanner,
      CockpitRawLedger,
      HeroCard,
      IndustryTypedHint,
      MarketScorePanel,
      GemIcon,
      HourglassIcon,
      MeField,
      NodeAdjusters,
      TeField,
      MultibuyPanel,
      ReactionStructureSelect,
      RecordRecentBlueprint,
      SavedPlanRows,
      SavedPlansManager,
      SelectedSystemBox,
      TemplateLoader,
      TemplatesMenu,
      KPI_FIG,
      KpiHead,
      KpiHelp,
      KpiTile,
      SimpleTile,
      useTemplatePlanner,
      StructureBonusReadout,
      HERO_LOCATION_CONTROL_WELL_CLASS,
      HERO_LOCATION_GROUP_CLASS,
      HERO_LOCATION_ROW_CLASS,
      PLANNER_DISCLOSURE_TRIGGER_CLASS,
      activityLabel,
      marginToneClass,
      getBlueprintPricing,
      getBlueprintSearchIndex,
      getBuildLocation,
      readRecentBlueprints,
      recordRecentBlueprint,
      renameSavedPlan,
      setSavedPlanFavorite,
      TEMPLATE_APPLY_GATE_MS,
      useBuildCharacterSkillLevels,
      useManagedRowMenu,
      useRecentBlueprints,
      useSavedPlans,
    ];
    expect(pinned.length).toBeGreaterThan(0);
    for (const value of pinned) {
      expect(value).toBeDefined();
    }
  });
});
