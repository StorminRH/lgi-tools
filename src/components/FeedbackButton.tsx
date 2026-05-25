import { Pill } from '@/components/ui/pill';

// Floating feedback affordance. Fixed to the bottom-right corner so it's
// reachable at any scroll position. /feedback is a placeholder until 2.8.5
// lands the real Discord-webhook route.
export function FeedbackButton() {
  return (
    <a
      href="/feedback"
      className="fixed bottom-4 right-4 z-30 inline-flex shadow-lg hover:opacity-90 transition-opacity"
    >
      <Pill tone="green">Feedback</Pill>
    </a>
  );
}
