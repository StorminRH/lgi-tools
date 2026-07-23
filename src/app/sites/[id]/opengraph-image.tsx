import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { toneHex } from '@/components/ui/tones';
import { loadSocialCardFonts } from '@/app/_social-card/fonts';
import { getPricedSiteDetail } from '@/features/wormhole-sites/queries';
import { deriveSiteSocialCardContent } from '@/features/wormhole-sites/site-social-card';
import { parseNumericRouteId } from '@/transport/route-id';

/** Accessible alternative text embedded in this generated social image. */
export const alt = 'LGI.tools wormhole site overview';
/** Canonical pixel dimensions for this generated social image. */
export const size = { width: 1200, height: 630 };
/** MIME type emitted by this generated social image route. */
export const contentType = 'image/png';

/**
 * Renders the 1200 by 630 Open Graph image for this route using bundled fonts; callers provide
 * only route parameters where required.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = parseNumericRouteId((await params).id);
  if (id === null) notFound();

  const site = await getPricedSiteDetail(id);
  if (!site) notFound();
  const card = deriveSiteSocialCardContent(site);
  const fonts = await loadSocialCardFonts();

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '58px 70px',
        backgroundColor: 'black',
        color: 'white',
        fontFamily: 'JetBrains Mono',
        border: `2px solid ${toneHex.neutral}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: toneHex.green,
          fontSize: 24,
          letterSpacing: 2,
        }}
      >
        <span>[ LGI.tools ]</span>
        <span style={{ color: toneHex.neutral }}>WORMHOLE SITE INTELLIGENCE</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div
          style={{
            display: 'flex',
            color: toneHex.green,
            fontSize: 24,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {card.classification}
        </div>
        <div
          style={{
            display: 'flex',
            maxWidth: 1040,
            fontFamily: 'Barlow Condensed',
            fontSize: 82,
            lineHeight: 0.92,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            textWrap: 'balance',
          }}
        >
          {card.name}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', color: toneHex.neutral, fontSize: 18, letterSpacing: 2 }}>
            {card.valueCaption}
          </div>
          <div style={{ display: 'flex', color: toneHex.green, fontSize: 44 }}>
            {card.value}
          </div>
        </div>
        <div style={{ display: 'flex', color: toneHex.neutral, fontSize: 18, letterSpacing: 2 }}>
          LO-GANG INDUSTRIES
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
