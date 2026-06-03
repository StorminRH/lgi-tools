import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { ContactForm } from '@/features/contact/components/ContactForm';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Reach the developer of LGI.tools — bug reports, ideas, and data corrections.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <header className="w-full max-w-[640px] mb-6 pb-4 border-b border-border-soft">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase">
          Contact
        </div>
      </header>

      <div className="w-full max-w-[640px]">
        <Card className="px-5 py-5">
          <ContactForm />
        </Card>
      </div>
    </div>
  );
}
