import { Button } from '@/components/ui/button';

export function RetryJobForm({ jobId }: { jobId: number }) {
  return (
    <form action="/api/admin/esi-jobs/retry" method="post">
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" variant="secondary" size="sm" className="text-isk">
        Retry
      </Button>
    </form>
  );
}
