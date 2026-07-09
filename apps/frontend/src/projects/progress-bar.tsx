import type { Progress } from './progress';

export interface ProgressBarProps {
  progress: Progress;
}

/**
 * Project completion progress bar (US3, FR-010). Renders `percent` from the pure `progress()`
 * helper using shared design tokens, with an explicit "no tasks yet" zero state so an empty
 * backlog reads clearly rather than as a stuck 0%.
 */
export function ProgressBar({ progress }: ProgressBarProps) {
  const { total, completed, percent } = progress;

  return (
    <div className="flex flex-col gap-1" data-testid="progress">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total === 0 ? 'No tasks yet' : `${completed} of ${total} complete`}</span>
        <span data-testid="progress-percent">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Project completion"
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
