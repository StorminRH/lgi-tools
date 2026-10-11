export const uiAdoptionRegistry = {
  rawButtons: [
    {
      file: 'src/components/composition/account/LoginButton.tsx',
      reason: "CCP's official EVE SSO control retains its provider-owned treatment.",
    },
  ],
  rawDetails: [
    {
      file: 'src/features/wormhole-sites/components/SitesTable.tsx',
      reason: "SortableTable's expandable-row API requires the native details owner.",
    },
  ],
  nativeTitles: [
    {
      file: 'src/components/composition/NavTools.tsx',
      reason: 'Owned by the deferred Category-dropdown top nav + module expansion backlog item.',
    },
  ],
  temporaryCssFamilies: [],
  retainedCssFamilies: [
    'industry-section',
    'nav-host',
    'nav-search',
    'prose-copy',
    'sites-detail-zoom',
    'sites-lightbox',
    'sites-table-expanded',
  ],
} as const;
