import type { Metadata } from "next";
import { IBM_Plex_Mono, Barlow_Condensed } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexMono.variable} ${barlow.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
