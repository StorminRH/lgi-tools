import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const socialCardFontData = Promise.all([
  readFile(join(process.cwd(), 'assets/fonts/BarlowCondensed-Bold.ttf')),
  readFile(join(process.cwd(), 'assets/fonts/JetBrainsMono-Regular.ttf')),
]);

export async function loadSocialCardFonts() {
  const [barlowCondensedBold, jetBrainsMonoRegular] = await socialCardFontData;
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
