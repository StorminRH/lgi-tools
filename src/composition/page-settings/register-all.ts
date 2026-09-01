import { registerPageSettings } from '@/platform/page-settings';
import { PAGE_SETTINGS_SPECS } from './specs';

for (const spec of PAGE_SETTINGS_SPECS) {
  registerPageSettings(spec);
}
