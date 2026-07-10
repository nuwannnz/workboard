import type { SaveStatus as Status } from './use-note-editor';

export interface SaveStatusProps {
  status: Status;
  onRetry?: () => void;
}

const LABELS: Record<Status, string> = {
  idle: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Couldn’t save',
};

/**
 * Auto-save status indicator (contracts §Editor & auto-save, FR-006). Renders the current state
 * from the shared design tokens so the user trusts nothing is lost; the `error` state offers a
 * non-silent retry.
 */
export function SaveStatus({ status, onRetry }: SaveStatusProps) {
  const isError = status === 'error';
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="save-status"
      data-status={status}
      className={isError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
    >
      {LABELS[status]}
      {isError && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid="save-retry"
          className="ml-2 font-medium underline"
        >
          Retry
        </button>
      ) : null}
    </p>
  );
}
