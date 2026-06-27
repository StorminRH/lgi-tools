import type { Metadata } from "next";
import { IBM_Plex_Mono, Barlow_Condensed, JetBrains_Mono, Geist } from "next/font/google";
import { Suspense } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { FeedbackButton } from "@/components/FeedbackButton";
import { TelemetryReporter } from "@/components/telemetry/TelemetryReporter";
import { AuthProvider } from "@/features/auth/components/AuthProvider";
import { ConvexClientProvider } from "@/features/auth/components/ConvexClientProvider";
import { LoadingToastProvider } from "@/components/ui/loading-toast";
import { Toaster } from "@/components/ui/toast";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import { SITE_URL } from "@/config/site-url";
import { readEnv } from "@/lib/env";

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  // Distinct from the Tailwind `--font-jb` theme token (globals.css) so the token
  // can reference this face instead of itself — the same next/font-var ≠
  // theme-token split the other three families use.
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
});

// Geist (variable font) — descriptive body copy only, via the .body-copy class
// (see globals.css). Everything else stays IBM Plex Mono / Barlow / JetBrains.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const DEFAULT_DESCRIPTION =
  "Lo-Gang Industries — first-party Eve Online tools for wormhole pilots. " +
  "Browse all 69 wormhole sites with live Jita prices on ore and gas resources.";

const googleVerification = readEnv("GOOGLE_SITE_VERIFICATION");

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
    images: [{ url: "/logo.png", width: 1200, height: 630, alt: "LGI.tools" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LGI.tools",
    description: DEFAULT_DESCRIPTION,
    images: ["/logo.png"],
  },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexMono.variable} ${barlow.variable} ${jetBrainsMono.variable} ${geist.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {/* Sitewide dot-lattice backdrop (3.6.11 F1) — a fixed full-viewport
         * layer behind every route. Reuses the approved landing recipe (see
         * .page-backdrop in globals.css); purely decorative, reads nothing. */}
        <div className="page-backdrop" aria-hidden="true" />
        <AuthProvider>
          {/* Autosave preferences (F4): reads the session to pick the localStorage
           * (anon) vs Neon (logged-in) tier, so it sits inside AuthProvider. */}
          <PreferencesProvider>
            <ConvexClientProvider>
              {/* The shared loading-toast PROVIDER lives here so any live
               * surface can register via useLoadingToast; it drives one keyed
               * sonner toast (the <Toaster> mounted below). Inside
               * ConvexClientProvider so Convex-driven `syncing` consumers share
               * a tree with the provider. */}
              <LoadingToastProvider>
                <AppHeader />
                <main className="flex-1">{children}</main>
                <Footer />
                <FeedbackButton />
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
        {/* Only on Vercel (prod/preview), where the script is served same-origin.
            In local dev the package loads its debug script cross-origin from
            va.vercel-scripts.com, which the CSP blocks — and it can't report from
            localhost anyway, so it's pure console noise. */}
        {process.env.NODE_ENV === "production" && <SpeedInsights />}
      </body>
    </html>
  );
}
