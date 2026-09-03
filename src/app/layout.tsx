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

  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const DEFAULT_DESCRIPTION =
  "Lo-Gang Industries — Eve Online tools for wormhole pilots. " +
  "Browse wormhole sites with live Jita prices on ore and gas resources.";

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
  },
  twitter: {
    card: "summary_large_image",
    title: "LGI.tools",
    description: DEFAULT_DESCRIPTION,
  },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "overlays-content",
};

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
      <body className="min-h-full flex flex-col">
        <div className="page-backdrop" aria-hidden="true" />
        <div className="page-grain" aria-hidden="true" />
        <AuthProvider>
          <PreferencesProvider>
            <ConvexClientProvider>
              <LoadingToastProvider>
                <PageMenuProvider>
                  {children}
                </PageMenuProvider>
              </LoadingToastProvider>
            </ConvexClientProvider>
          </PreferencesProvider>
        </AuthProvider>
        <Toaster />
        <Suspense fallback={null}>
          <TelemetryReporter />
        </Suspense>
        {isHostedVercel() && <SpeedInsights />}
      </body>
    </html>
  );
}
