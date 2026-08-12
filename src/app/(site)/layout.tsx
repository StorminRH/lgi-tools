import { SiteFrame } from '@/components/composition/SiteFrame';

/**
 * Wraps every site route in the shared header, main, footer, and feedback
 * chrome. Atlas landing inherits this frame; a selected map covers it with
 * the full-viewport canvas.
 */
export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SiteFrame>{children}</SiteFrame>;
}
