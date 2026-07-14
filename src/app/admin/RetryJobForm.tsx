import { Button } from '@/components/ui/button';
import type { RangeKey } from './period';

export function RetryJobForm({ jobId, range }: { jobId: number; range: RangeKey }) {
  return (
    <form action="/api/admin/esi-jobs/retry" method="post">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="range" value={range} />
      <Button type="submit" variant="secondary" size="sm" className="text-isk">
        Retry
      </Button>
    </form>
  );
}
