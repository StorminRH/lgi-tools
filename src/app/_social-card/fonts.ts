import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Read once at module scope with top-level await — the documented Cache
// Components pattern for bundled request-independent assets. Awaiting file IO
// inside the handler counts as uncached data and made the root social image's
// render mode flap between static and dynamic across otherwise-identical
// production builds.
const [barlowCondensedBold, jetBrainsMonoRegular] = await Promise.all([
  readFile(join(process.cwd(), 'assets/fonts/BarlowCondensed-Bold.ttf')),
  readFile(join(process.cwd(), 'assets/fonts/JetBrainsMono-Regular.ttf')),
]);

/**
 * The bundled font descriptors social-card rendering embeds; synchronous so the
 * image handlers' render path performs no IO.
 */
export function socialCardFonts() {
  return [
    {
      name: 'Barlow Condensed',
      data: barlowCondensedBold,
      style: 'normal' as const,
      weight: 700 as const,
    },
    {
      name: 'JetBrains Mono',
      data: jetBrainsMonoRegular,
      style: 'normal' as const,
      weight: 400 as const,
    },
  ];
}
