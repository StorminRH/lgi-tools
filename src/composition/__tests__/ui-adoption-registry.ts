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
  typeRoleExceptions: [
    {
      file: 'src/app/(site)/admin/users/AccessCards.tsx',
      count: 1,
      reason: 'A back link at control size, not a label.',
    },
    {
      file: 'src/app/(site)/legal/page.tsx',
      count: 1,
      reason: 'A page-title look at text-h3, a size pageTitle does not offer.',
    },
    {
      file: 'src/app/(site)/preview/cards/page.tsx',
      count: 3,
      reason: 'The site-card sandbox trials arbitrary sizes and colours.',
    },
    {
      file: 'src/components/composition/AppHeader.tsx',
      count: 1,
      reason: 'The header wordmark, not a label or title role.',
    },
    {
      file: 'src/components/composition/Footer.tsx',
      count: 2,
      reason: 'Footer copy at an off-step 0.03em, awaiting a design pass.',
    },
    {
      file: 'src/components/composition/GlobalSearch.tsx',
      count: 1,
      reason: 'A data-label override at 0.07em; collapsing it to tracking-label awaits a design pass.',
    },
    {
      file: 'src/components/composition/HeroBanner.tsx',
      count: 2,
      reason: 'The landing wordmark and tagline, tracked off the scale on purpose.',
    },
    {
      file: 'src/components/composition/StatusPanel.tsx',
      count: 1,
      reason: 'The error and not-found title at text-hero, a size pageTitle does not offer.',
    },
    {
      file: 'src/components/composition/account/LoginButton.tsx',
      count: 1,
      reason: 'An interactive control with its own hover treatment.',
    },
    {
      file: 'src/components/composition/account/RevokeRedirectLightbox.tsx',
      count: 1,
      reason: 'A link-styled button.',
    },
    {
      file: 'src/components/composition/industry-workspace/StructuresManager.tsx',
      count: 1,
      reason: 'A hover-revealed action link.',
    },
    {
      file: 'src/components/composition/map/MapMenu.tsx',
      count: 1,
      reason: 'An interactive menu trigger.',
    },
    {
      file: 'src/components/ui/callout.tsx',
      count: 1,
      reason: 'Callout body copy at an off-step 0.03em, awaiting a design pass.',
    },
    {
      file: 'src/features/changelog/components/MasterSection.tsx',
      count: 1,
      reason: 'A page-title look at text-stat, a size pageTitle does not offer.',
    },
    {
      file: 'src/features/industry-planner/components/CockpitKpis.tsx',
      count: 1,
      reason: "A row total at its row's text-ui size, not a label size.",
    },
    {
      file: 'src/features/wormhole-sites/components/SiteCard.tsx',
      count: 1,
      reason: 'A link with its own hover treatment.',
    },
    {
      file: 'src/mapper/canvas/SystemNode.tsx',
      count: 1,
      reason: 'A map node name, sized by the node.',
    },
    {
      file: 'src/mapper/windows/MapWindow.tsx',
      count: 1,
      reason: 'A window title variant, a title role rather than an eyebrow.',
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
