import { cn } from '@/components/ui/cn';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { formatSec } from '@/data/eve-data/systems-search';
import { HERO_LOCATION_CONTROL_WELL_CLASS } from '../industry-styles';

export function SelectedSystemBox({
  name,
  security,
  locked,
  onClear,
}: {
  name: string;
  security: number | null;
  locked?: string | null;
  onClear?: () => void;
}) {
  return (
    <div
      className={cn(
        HERO_LOCATION_CONTROL_WELL_CLASS,
        'flex h-[30px] items-center gap-2 border border-border bg-bg px-2',
      )}
    >
      <span className="min-w-0 truncate font-data text-ui text-tone-blue">
        {name} {formatSec(security)}
      </span>
      {locked ? (
        <Tooltip content={`Locked to ${locked}`}>
          <span
            tabIndex={0}
            className="ml-auto shrink-0 text-label uppercase tracking-wide text-muted"
          >
            locked
          </span>
        </Tooltip>
      ) : onClear ? (
        <Button
          variant="bare"
          type="button"
          onClick={onClear}
          className="ml-auto shrink-0 cursor-pointer text-label uppercase tracking-wide text-muted hover:text-text"
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
