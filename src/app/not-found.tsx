import { NotFoundContent } from '@/components/composition/NotFoundContent';
import { SiteFrame } from '@/components/composition/SiteFrame';

export const metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <SiteFrame>
      <NotFoundContent />
    </SiteFrame>

  );
}
