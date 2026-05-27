import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'LGI.tools — Lo-Gang Industries Eve Online tools';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Default Open Graph card. Rendered at build/request time by Next's
// ImageResponse — placeholder generated wordmark until a hand-designed
// PNG replaces it. To swap to a static asset:
//   1. Drop the file at public/og-default.png (1200×630).
//   2. In src/app/layout.tsx, change the openGraph.images URL from
//      "/opengraph-image" to "/og-default.png" (same for twitter.images).
//   3. Delete this file. Next picks up the static asset directly from
//      /public/og-default.png.
// Per-route OG images (e.g. site detail) can grow into sibling
// opengraph-image.tsx files later under each route folder.
export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 24,
          backgroundColor: '#070b10',
          backgroundImage:
            'radial-gradient(circle at 50% 35%, rgba(36, 198, 137, 0.18) 0%, rgba(7, 11, 16, 0) 60%)',
          color: '#dbe5ec',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            fontSize: 132,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1,
            textTransform: 'uppercase',
          }}
        >
          <span style={{ color: '#24c689' }}>[ </span>
          <span>Lo-Gang</span>
          <span style={{ color: '#24c689' }}> ]</span>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 44,
            fontWeight: 400,
            letterSpacing: 14,
            textTransform: 'uppercase',
            color: '#6a7a8a',
          }}
        >
          <span>Industries</span>
          <span style={{ color: '#24c689', letterSpacing: 'normal' }}>.</span>
          <span style={{ color: '#24c689' }}>tools</span>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 36,
            fontSize: 26,
            color: '#9ba8b4',
            letterSpacing: 1,
            maxWidth: 880,
            textAlign: 'center',
          }}
        >
          First-party Eve Online tools for wormhole pilots.
        </div>
      </div>
    ),
    { ...size },
  );
}
