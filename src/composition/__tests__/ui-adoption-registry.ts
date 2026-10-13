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
  uppercaseExceptions: [
    {
      file: 'src/app/(site)/sites/[id]/opengraph-image.tsx',
      count: 2,
      reason: 'The share-card image, a brand graphic set in capitals; not page text.',
    },
    {
      file: 'src/app/opengraph-image.tsx',
      count: 1,
      reason: 'The share-card image, a brand graphic set in capitals; not page text.',
    },
    {
      file: 'src/components/composition/AppHeader.tsx',
      count: 1,
      reason: 'The [LGI].TOOLS logo.',
    },
    {
      file: 'src/components/composition/HeroBanner.tsx',
      count: 2,
      reason: 'The landing wordmark and tagline.',
    },
    {
      file: 'src/components/composition/map/MapMenu.tsx',
      count: 1,
      reason: 'The [LGI].tools logo in the map menu.',
    },
    {
      file: 'src/mapper/canvas/SystemNode.tsx',
      count: 1,
      reason: 'The system class chip, an EVE code (C4, HS, NS).',
    },
    {
      file: 'src/mapper/signatures/scanner-row-cells.tsx',
      count: 1,
      reason: 'The signature class tag, an EVE code (C3, HS).',
    },
    {
      file: 'src/mapper/windows/MapWindow.tsx',
      count: 1,
      reason: 'The docked window title, an EVE system name.',
    },
  ],
  typeRoleExceptions: [
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
      file: 'src/components/composition/HeroBanner.tsx',
      count: 2,
      reason: 'The landing wordmark and tagline, tracked off the scale on purpose.',
    },
    {
      file: 'src/components/composition/map/MapMenu.tsx',
      count: 1,
      reason: 'The map menu wordmark, not a label or title role.',
    },
    {
      file: 'src/components/ui/callout.tsx',
      count: 1,
      reason: 'Callout body copy at an off-step 0.03em, awaiting a design pass.',
    },
    {
      file: 'src/mapper/canvas/SystemNode.tsx',
      count: 1,
      reason: 'A system class chip, an EVE code in capitals sized by the node.',
    },
    {
      file: 'src/mapper/signatures/scanner-row-cells.tsx',
      count: 1,
      reason: 'A signature class tag, an EVE code in capitals.',
    },
    {
      file: 'src/mapper/windows/MapWindow.tsx',
      count: 1,
      reason: 'The docked window title, an EVE system name in capitals.',
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
