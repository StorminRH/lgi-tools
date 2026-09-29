import type { Metadata } from 'next';
import { PlanLanding } from '@/features/industry-planner/components/PlanLanding';

export const metadata: Metadata = {
  title: 'Job Plan — Industry Planner',
  description:
    'Plan an Eve Online build: search any blueprint or reaction for its input cost, margin and build time at live Jita rates.',
  alternates: { canonical: '/industry/plan' },
};

export default function IndustryPlanPage() {
  return <PlanLanding />;
}
