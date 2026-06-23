import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';

// Stand-in for the signed-in left column. P3b replaces this with the character
// roster (portraits, skill queues, Add Character) — the swap happens here in the
// `session` branch of HomeLeftColumn and touches nothing else. Kept deliberately
// short so the layout reads correctly even for a single character (the left
// column must not assume a tall fill).
export function HomeLoggedInPlaceholder({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-4 pt-2">
      <SectionLabel>Your characters</SectionLabel>
      <Card className="px-4 py-4">
        <p className="text-[13px] text-text leading-[1.7]">
          Signed in as <span className="text-name">{name}</span>. Your character
          roster and skill queues will appear here soon.
        </p>
      </Card>
    </div>
  );
}
