'use client';

// The portrait menu's DYNAMIC half (ACCOUNT.5): the current route's
// page-settings section, read from the ACCOUNT.4 slot (usePageSettings — the one
// resolution path) and rendered as live segmented preference controls. Routes
// with no spec (or no renderable section controls) render NOTHING — no
// empty-state filler, no dangling divider.
//
// The rows are NON-item popup content (the nav-menu-login precedent), so
// selecting a value deliberately does not close the menu — adjust, watch the
// page change behind, adjust again. Every binding of a preference key shares
// PreferencesProvider state, so the /sites on-page toggles and these rows stay
// in sync live.
//
// Shared zone on purpose: it bridges the page-settings layer to the auth
// feature's menu without either importing the other. (The ACCOUNT.7 character
// strip deliberately does NOT mount here — it renders on the page surface
// itself, inside each strip-declaring panel, where the server-derived
// per-surface character list lives; this menu half renders preference controls
// only.) No usePathname and no Suspense here — PageMenuProvider already
// isolates the request-time read (the #182 lesson).

import { usePageSettings } from '@/components/PageMenuProvider';
import { usePreference } from '@/components/PreferencesProvider';
import { SegmentedControl } from '@/components/ui/segmented';
import { resolveMenuControls, type MenuControlModel } from '@/platform/page-settings/controls';

// Own component so usePreference is never called inside a map.
function ControlRow({ model }: { model: MenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <div className="account-menu-control">
      <span className="account-menu-control-label">{model.label}</span>
      <SegmentedControl
        options={model.options.map((option) => ({ value: option, label: option }))}
        value={value}
        onChange={setValue}
        label={model.label}
      />
    </div>
  );
}

/**
 * Renders the current page's registered controls and actions, preserving their declared order and
 * controlled-state callbacks.
 */
export function PageMenuSection() {
  const spec = usePageSettings();
  const models = resolveMenuControls(spec);
  if (models.length === 0) return null;

  const title = spec?.title ?? 'Page settings';
  return (
    <div className="account-menu-section" role="group" aria-label={title}>
      <div className="account-menu-group-label" aria-hidden="true">
        {title}
      </div>
      {models.map((model) => (
        <ControlRow key={model.key} model={model} />
      ))}
    </div>
  );
}
