import { getFullSession } from '@/composition/session';
import { visibleSettingsGroups } from './settings-sections';
import { SettingsNav, SettingsNavFrame } from './settings-nav';

export async function SettingsRail() {
  const session = await getFullSession();
  return <SettingsNav groups={visibleSettingsGroups(session?.isAdmin ?? false)} />;
}

export function SettingsRailFallback() {
  return <SettingsNavFrame groups={visibleSettingsGroups(false)} active={null} />;
}
