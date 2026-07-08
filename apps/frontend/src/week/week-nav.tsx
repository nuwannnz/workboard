import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { weekDays } from './week';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Human label for a `YYYY-MM-DD` date, e.g. `Jul 6`. */
function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** A `Jul 6 – Jul 12, 2026` label for the displayed week. */
function weekLabel(referenceMonday: string): string {
  const days = weekDays(referenceMonday);
  const year = days[6].split('-')[0];
  return `${shortDate(days[0])} – ${shortDate(days[6])}, ${year}`;
}

export interface WeekNavProps {
  referenceMonday: string;
  onPrev: () => void;
  onNext: () => void;
  onCurrent: () => void;
}

/**
 * Week navigation controls (FR-007, SC-009): previous / next week and a single "This week"
 * action that jumps back to the week containing today. Drives `referenceMonday` in the hook.
 */
export function WeekNav({ referenceMonday, onPrev, onNext, onCurrent }: WeekNavProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous week"
        data-testid="week-prev"
        onClick={onPrev}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next week"
        data-testid="week-next"
        onClick={onNext}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="sm" data-testid="week-today" onClick={onCurrent}>
        This week
      </Button>
      <span className="ml-1 text-sm text-muted-foreground" data-testid="week-range">
        {weekLabel(referenceMonday)}
      </span>
    </div>
  );
}
