import type { Metadata } from "next";
import { IBM_Plex_Mono, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { FeedbackButton } from "@/components/FeedbackButton";
import { TelemetryReporter } from "@/components/telemetry/TelemetryReporter";
import { getSession, isAdmin } from "@/features/auth/session";

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

export const metadata: Metadata = {
  title: "LGI.tools",
  description: "Lo-Gang Industries — Eve Online wormhole tools",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const showAdminLink = isAdmin(session);

  return (
    <html
      lang="en"
      className={`${plexMono.variable} ${barlow.variable} ${jetBrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <AppHeader session={session} showAdminLink={showAdminLink} />
        <main className="flex-1">{children}</main>
        <Footer />
        <FeedbackButton session={session} />
        <Suspense fallback={null}>
          <TelemetryReporter />
        </Suspense>
      </body>
    </html>
  );
}
