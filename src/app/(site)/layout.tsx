import { SiteFrame } from '@/components/composition/SiteFrame';

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SiteFrame>{children}</SiteFrame>;

}
