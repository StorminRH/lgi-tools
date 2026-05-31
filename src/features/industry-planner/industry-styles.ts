// Feature-level domain → UI mapping for the Industry Planner. The only place
// that knows "a thin margin is orange" or "activity 1 is Manufacturing". The
// reusable primitives stay domain-agnostic; this file picks tones/labels from
// the shared vocabulary (CLAUDE.md > Architecture Invariants).

import { toneTextClass, type Tone } from '@/components/ui/tones';

// Below this percentage a positive margin is "thin" (orange) rather than
// healthy (green). A rough cut for at-a-glance scanning, not a trading signal.
const THIN_MARGIN_PCT = 5;

// Text-colour class for a margin figure. Loss → red, thin → orange, healthy →
// green, unknown (no product sell price) → muted.
export function marginToneClass(marginPct: number | null): string {
  if (marginPct === null) return 'text-muted';
  if (marginPct < 0) return toneTextClass('red');
  if (marginPct < THIN_MARGIN_PCT) return toneTextClass('orange');
  return toneTextClass('green');
}

// Industry activity labels. Manufacturing (1) and reactions (11) are the only
// activities the planner models (see eve-data INDUSTRY_ACTIVITY_IDS).
export const ACTIVITY_LABEL: Record<number, string> = {
  1: 'Manufacturing',
  11: 'Reaction',
};

export function activityLabel(activityId: number): string {
  return ACTIVITY_LABEL[activityId] ?? 'Industry';
}

// A material/build category: a display label, a palette tone, and a sort order.
// Categories are keyed off the SDE *group* (not the broader category), because
// group is what distinguishes e.g. a manufactured Fuel Block from a reaction
// output — both sit under the `Material` SDE category. Adding/retuning a
// category is a config edit here; nothing else changes.
export interface Category {
  label: string;
  tone: Tone;
  order: number;
}

// --- Raw materials (the cost panel — things you buy/gather) ------------
const MINERALS: Category = { label: 'Minerals', tone: 'neutral', order: 21 };
const ICE: Category = { label: 'Ice Products', tone: 'blue', order: 22 };
const GAS: Category = { label: 'Gas', tone: 'teal', order: 23 };
const MOON: Category = { label: 'Moon Materials', tone: 'magenta', order: 24 };
const SALVAGE: Category = { label: 'Salvage', tone: 'yellow', order: 25 };
const PLANETARY: Category = { label: 'Planetary', tone: 'orange-soft', order: 26 };
const OTHER_MATERIAL: Category = { label: 'Other Materials', tone: 'neutral', order: 29 };

const RAW_BY_GROUP: Record<string, Category> = {
  Mineral: MINERALS,
  'Ice Product': ICE,
  'Harvestable Cloud': GAS,
  'Moon Materials': MOON,
  'Ancient Salvage': SALVAGE,
  'Salvaged Materials': SALVAGE,
  'Named Components': SALVAGE,
  'Rogue Drone Components': SALVAGE,
  'Abyssal Materials': SALVAGE,
};

export function classifyRaw(groupName: string, categoryName: string): Category {
  return (
    RAW_BY_GROUP[groupName] ??
    (categoryName === 'Planetary Commodities' ? PLANETARY : OTHER_MATERIAL)
  );
}

// --- Build-sequence tree: a node's label + colour ----------------------
// The phase a node sits in (how deep it is) is derived from graph height in
// the data layer; this picks only its LABEL and colour, and every label is a
// real in-game identifier — never an invented bucket. A reaction output
// (activity 11) reads as "Reaction"; any other buildable reads as its own SDE
// group name. The root product reads as its group/category (e.g. "Frigate").
// Raws reuse the ledger's source-category colour but show their real SDE group
// name, so no invented name enters the tree.
const REACTION_ACTIVITY_ID = 11;

export interface NodeLabel {
  label: string;
  tone: Tone;
}

export function classifyBuildNode(args: {
  isRaw: boolean;
  isRoot: boolean;
  activityId?: number;
  groupName: string;
  categoryName: string;
}): NodeLabel {
  const { isRaw, isRoot, activityId, groupName, categoryName } = args;
  if (isRaw) {
    return { label: groupName || categoryName || 'Raw Material', tone: classifyRaw(groupName, categoryName).tone };
  }
  if (isRoot) {
    return { label: groupName || categoryName || 'Final Product', tone: 'teal' };
  }
  if (activityId === REACTION_ACTIVITY_ID) {
    return { label: 'Reaction', tone: 'purple' };
  }
  return { label: groupName || categoryName || 'Manufacturing', tone: 'blue' };
}

// Tailwind bg classes for a small category marker dot. Literal strings (not
// interpolated) so the JIT keeps them; CSP-safe (no inline style). Keyed by
// tone so every category resolves through its `Category.tone`.
const DOT_CLASS: Record<Tone, string> = {
  neutral: 'bg-[#6a7a8a]',
  green: 'bg-[#3dd68c]',
  'green-strong': 'bg-[#44dd99]',
  orange: 'bg-[#d68c3d]',
  'orange-soft': 'bg-[#cc7733]',
  red: 'bg-[#dd4444]',
  'red-soft': 'bg-[#cc5555]',
  magenta: 'bg-[#cc55cc]',
  purple: 'bg-[#aa55ff]',
  yellow: 'bg-[#ccaa33]',
  teal: 'bg-[#33cc88]',
  blue: 'bg-[#3399cc]',
};

export function toneDotClass(tone: Tone): string {
  return DOT_CLASS[tone];
}
