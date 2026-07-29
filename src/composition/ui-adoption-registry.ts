/**
 * The audited exception and CSS-family baseline for primitive adoption.
 *
 * Lint rejects new bypasses immediately; the census binds those syntactic rails
 * to the exact surviving found-set so an exemption cannot widen silently.
 */
export const uiAdoptionRegistry = {
  rawButtons: [
    {
      file: 'src/components/composition/account/LoginButton.tsx',
      reason: "CCP's official EVE SSO control retains its provider-owned treatment.",
    },
  ],
  rawDetails: [
    {
      file: 'src/features/devlog/components/CodeExcerpt.tsx',
      reason: 'A standalone code excerpt owns a native disclosure surface rather than list chrome.',
    },
    {
      file: 'src/features/wormhole-sites/components/SitesTable.tsx',
      reason: "SortableTable's expandable-row API requires the native details owner.",
    },
  ],
  hiddenInputs: [
    'src/app/(site)/admin/RetryJobForm.tsx',
    'src/app/(site)/admin/statics/page.tsx',
    'src/components/composition/account/AdminForceLogoutForm.tsx',
    'src/components/composition/account/AdminReassignCharacterForm.tsx',
    'src/components/composition/account/AdminUnlinkCharacterForm.tsx',
    'src/components/composition/account/RoleToggleForm.tsx',
    'src/components/composition/account/SwitchCharacterForm.tsx',
    'src/components/composition/account/UnlinkCharacterForm.tsx',
  ],
  nativeTitles: [
    {
      file: 'src/components/composition/NavTools.tsx',
      reason: 'Owned by the deferred Category-dropdown top nav + module expansion backlog item.',
    },
  ],
  disabledControlTitles: [
    'src/components/composition/account/AdminForceLogoutForm.tsx',
    'src/components/composition/account/AdminReassignCharacterForm.tsx',
    'src/components/composition/account/AdminUnlinkCharacterForm.tsx',
    'src/components/composition/account/RoleToggleForm.tsx',
    'src/components/composition/account/UnlinkCharacterForm.tsx',
  ],
  temporaryCssFamilies: [],
  retainedCssFamilies: [
    'industry-bar-fill',
    'industry-cur',
    'nav-host',
    'nav-search',
    'prose-copy',
    'sites-detail-zoom',
    'sites-lightbox',
    'sites-table-expanded',
  ],
} as const;
