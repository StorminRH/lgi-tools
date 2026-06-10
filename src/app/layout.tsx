import type { Metadata } from "next";
import { IBM_Plex_Mono, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { FeedbackButton } from "@/components/FeedbackButton";
import { TelemetryReporter } from "@/components/telemetry/TelemetryReporter";
import { AuthProvider } from "@/features/auth/components/AuthProvider";
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
  variable: "--font-jb",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
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
      className={`${plexMono.variable} ${barlow.variable} ${jetBrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <AppHeader />
          <main className="flex-1">{children}</main>
          <Footer />
          <FeedbackButton />
        </AuthProvider>
        <Suspense fallback={null}>
          <TelemetryReporter />
        </Suspense>
        <SpeedInsights />
      </body>
    </html>
  );
}
