import { getSession, isAdmin } from '@/composition/session';
import { visibleSettingsGroups } from './settings-sections';
import { SettingsNav, SettingsNavFrame } from './settings-nav';

export async function SettingsRail() {
  const session = await getSession();
  return <SettingsNav groups={visibleSettingsGroups(isAdmin(session))} />;
}

export function SettingsRailFallback() {
  return <SettingsNavFrame groups={visibleSettingsGroups(false)} active={null} />;
}
