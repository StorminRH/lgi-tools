import { ImageResponse } from 'next/og';
import { toneHex } from '@/components/ui/tones';
import { socialCardFonts } from './_social-card/fonts';

export const alt = 'LGI.tools — Eve Online tools for wormhole pilots';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '68px 76px',
        backgroundColor: 'black',
        color: 'white',
        fontFamily: 'JetBrains Mono',
        border: `2px solid ${toneHex.neutral}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          color: toneHex.green,
          fontSize: 26,
          letterSpacing: 2,
        }}
      >
        <span>[</span>
        <span>LGI.tools</span>
        <span>]</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div
          style={{
            display: 'flex',
            fontFamily: 'Barlow Condensed',
            fontSize: 96,
            lineHeight: 0.92,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Eve Online tools
        </div>
        <div
          style={{
            display: 'flex',
            color: toneHex.neutral,
            fontSize: 28,
            letterSpacing: 1,
          }}
        >
          WORMHOLE SITES · LIVE PRICES · INDUSTRY PLANNING
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 110, height: 3, backgroundColor: toneHex.green }} />
        <div style={{ color: toneHex.neutral, fontSize: 20, letterSpacing: 2 }}>
          LO-GANG INDUSTRIES
        </div>
      </div>
    </div>,
    { ...size, fonts: socialCardFonts },
  );
}
