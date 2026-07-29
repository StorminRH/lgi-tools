import { SiteFrame } from '@/components/composition/SiteFrame';

/**
 * Wraps every existing site route in the shared header, main, footer, and
 * feedback chrome. Map routes live in a sibling group and do not inherit this.
 */
export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SiteFrame>{children}</SiteFrame>;
}
