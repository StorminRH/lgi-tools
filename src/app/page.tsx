import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Callout } from '@/components/ui/callout';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  state_mismatch:
    'Sign-in could not be verified. Try clicking "Log in with EVE" again.',
  token_exchange_failed:
    'EVE rejected the sign-in. Wait a moment and try again.',
  db_write_failed:
    'We signed you in but could not save your character record. Try again or report this.',
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawError = params.auth_error;
  const errorKey =
    typeof rawError === 'string' && rawError in AUTH_ERROR_MESSAGES ? rawError : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 gap-12">
      {errorKey && (
        <div className="w-full max-w-[640px]">
          <Callout label="Auth">{AUTH_ERROR_MESSAGES[errorKey]}</Callout>
        </div>
      )}

      <header className="flex flex-col items-center text-center gap-3">
        <h1 className="font-display font-bold text-[56px] sm:text-[72px] leading-none tracking-[0.04em] uppercase text-name">
          LGI<span className="text-muted">.</span>tools
        </h1>
        <p className="text-[11px] text-muted tracking-[0.18em] uppercase">
          Lo-Gang Industries · Eve Online wormhole tools
        </p>
      </header>

      <div
        className="grid w-full max-w-[1100px] gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}
      >
        <Link
          href="/sites"
          className="group block transition-colors"
        >
          <Card className="px-5 py-5 group-hover:border-[#2a3550] transition-colors">
            <div className="font-display font-bold text-[20px] tracking-[0.04em] uppercase text-name mb-1.5">
              Wormhole Sites
            </div>
            <div className="text-[11px] text-text leading-relaxed">
              Browse every wormhole site — combat anomalies, gas clouds, ore
              deposits, and hackable containers. Filter by class and type;
              expand any site for waves, NPCs, EWAR, and resource values.
            </div>
            <div className="mt-4 text-[10px] tracking-[0.18em] uppercase text-muted group-hover:text-isk transition-colors">
              Open →
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
