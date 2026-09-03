import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono, Geist } from "next/font/google";
import { Suspense } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { TelemetryReporter } from "@/components/composition/TelemetryReporter";
import { AuthProvider } from "@/platform/auth/components/AuthProvider";
import { ConvexClientProvider } from "@/platform/auth/components/ConvexClientProvider";
import { LoadingToastProvider } from "@/components/ui/loading-toast";
import { Toaster } from "@/components/ui/toast";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import { PageMenuProvider } from "@/components/composition/PageMenuProvider";
import { SITE_URL } from "@/config/site-url";
import { isHostedVercel, readEnv } from "@/lib/env";

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  // The data face for values, status, compact metadata and the wordmark.
  // The semantic theme token resolves to this next/font variable.
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Geist (variable font) — descriptive body copy only, via the .body-copy class
// (see globals.css). Everything else stays JetBrains Mono / Barlow.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const DEFAULT_DESCRIPTION =
  "Lo-Gang Industries — Eve Online tools for wormhole pilots. " +
  "Browse wormhole sites with live Jita prices on ore and gas resources.";

const googleVerification = readEnv("GOOGLE_SITE_VERIFICATION");

/** Static search and social metadata for the / route. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LGI.tools",
    template: "%s | LGI.tools",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: "LGI.tools",
  openGraph: {
    type: "website",
    siteName: "LGI.tools",
    title: "LGI.tools",
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "LGI.tools",
    description: DEFAULT_DESCRIPTION,
  },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
};

/** Root viewport: keep pinch-zoom available; keyboard overlays content instead of resizing layout. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "overlays-content",
};

/**
 * Renders the / route surface and owns its page-level composition, metadata boundary, and fallback
 * presentation.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${jetBrainsMono.variable} ${geist.variable} h-full`}
    >
      {/* Overscroll containment lives on the html/body rule in globals.css. */}
      <body className="min-h-full flex flex-col">
        {/* Sitewide space backdrop (3.6.11 F1, image since 3.6.24) — a fixed
         * full-viewport layer behind every route (see .page-backdrop in
         * globals.css); purely decorative, reads nothing. */}
        <div className="page-backdrop" aria-hidden="true" />
        {/* Sitewide film grain — the fixed full-viewport counterpart ABOVE
         * all content (see .page-grain in globals.css); purely decorative,
         * pointer-transparent, reads nothing. */}
        <div className="page-grain" aria-hidden="true" />
        <AuthProvider>
          {/* Autosave preferences (F4): reads the session to pick the localStorage
           * (anon) vs Neon (logged-in) tier, so it sits inside AuthProvider. */}
          <PreferencesProvider>
            <ConvexClientProvider>
              {/* No app-wide Convex subscription lives here: since the
               * online-status retirement, only Atlas surfaces subscribe, so
               * every other route pays nothing beyond the idle provider. */}
              {/* The shared loading-toast PROVIDER lives here so any live
               * surface can register via useLoadingToast; it drives one keyed
               * sonner toast (the <Toaster> mounted below). Inside
               * ConvexClientProvider so Convex-driven `syncing` consumers share
               * a tree with the provider. */}
              <LoadingToastProvider>
                {/* The page-menu slot (ACCOUNT.4): resolves the current
                 * route's page-settings spec for the portrait menu's dynamic
                 * half (ACCOUNT.5) to read. Innermost — it needs only the
                 * pathname (no auth/convex/preferences) — and wraps both the
                 * header and the page so each can read the slot. */}
                <PageMenuProvider>
                  {children}
                </PageMenuProvider>
              </LoadingToastProvider>
            </ConvexClientProvider>
          </PreferencesProvider>
        </AuthProvider>
        {/* The sonner portal toaster — a single viewport-fixed container on
         * <body>, decoupled from header flow by construction (the OOB.3 fix).
         * The loading-toast provider above drives it imperatively; one-off
         * callers use the same `toast` from @/components/ui/toast. */}
        <Toaster />
        <Suspense fallback={null}>
          <TelemetryReporter />
        </Suspense>
        {/* Only on Vercel prod/preview, where `/_vercel/speed-insights/*` exists.
            `next start` in CI is NODE_ENV=production but is not Vercel. */}
        {isHostedVercel() && <SpeedInsights />}
      </body>
    </html>
  );
}
