import type { ReactNode } from 'react';
import { Chakra_Petch, Geist, Geist_Mono } from 'next/font/google';
// Redesign-exploration styles — scoped to /dev/sandbox/redesign/* by this
// layout import, so the two mockup themes never leak into production CSS.
import './redesign.css';

// Candidate fonts for the redesign, loaded only under this route group.
// Theme A ("Phosphor") uses Geist + Geist Mono; Theme B ("Holo Console")
// uses Chakra Petch for display/UI over the existing Plex Mono data font.
const rdSans = Geist({ variable: '--font-rd-sans', subsets: ['latin'] });
const rdMono = Geist_Mono({ variable: '--font-rd-mono', subsets: ['latin'] });
const rdHolo = Chakra_Petch({
  variable: '--font-rd-holo',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

export default function RedesignLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${rdSans.variable} ${rdMono.variable} ${rdHolo.variable}`}>
      {children}
    </div>
  );
}
