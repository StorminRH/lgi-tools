import type { Metadata } from "next";
import { IBM_Plex_Mono, Barlow_Condensed } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { PageHeader } from "@/components/ui/page-header";
import { Footer } from "@/components/Footer";
import { FeedbackButton } from "@/components/FeedbackButton";
import { TelemetryReporter } from "@/components/telemetry/TelemetryReporter";
import { LoginButton } from "@/features/auth/components/LoginButton";
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
      className={`${plexMono.variable} ${barlow.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <PageHeader
          right={<LoginButton session={session} showAdminLink={showAdminLink} />}
        />
        <main className="flex-1">{children}</main>
        <Footer />
        <FeedbackButton />
        <Suspense fallback={null}>
          <TelemetryReporter />
        </Suspense>
      </body>
    </html>
  );
}
