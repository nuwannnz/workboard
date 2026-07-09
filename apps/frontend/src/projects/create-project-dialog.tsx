import { useEffect, useState, type FormEvent } from 'react';
import { PROJECT_COLORS, type ProjectColor } from '@workboard/shared';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';
import { colorSwatch } from './project-colors';

/** The editable project fields shared by create and edit. */
export interface ProjectFormValues {
  name: string;
  description?: string;
  color: ProjectColor;
}

export interface CreateProjectDialogProps {
  /** Prefilled values for edit; omitted for create (Story 5.5 reuses this dialog). */
  initial?: ProjectFormValues;
  /** Dialog heading + submit verb ('Create project' vs 'Save changes'). */
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => Promise<boolean>;
}

/**
 * Create/edit project dialog (FR-001/FR-002, US1 + Story 5.5). Fields: name (required, inline
 * "Name is required" on empty), optional description, and a color picker over the closed
 * `PROJECT_COLORS` palette (defaulted). A lightweight modal built from the shared design
 * tokens, keyboard-dismissable with Escape. An empty-name save is rejected inline with the
 * prior value retained.
 */
export function CreateProjectDialog({
  initial,
  mode = 'create',
  onClose,
  onSubmit,
}: CreateProjectDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [color, setColor] = useState<ProjectColor>(initial?.color ?? 'slate');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required'); // prior value retained; dialog stays open
      return;
    }
    setBusy(true);
    const ok = await onSubmit({
      name: trimmed,
      description: description.trim() ? description.trim() : undefined,
      color,
    });
    setBusy(false);
    if (ok) onClose();
    else setError('Could not save the project. Please try again.');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'edit' ? 'Edit project' : 'New project'}
        data-testid="create-project-dialog"
        className="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-semibold">
          {mode === 'edit' ? 'Edit project' : 'New project'}
        </h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="project-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              data-testid="project-name"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="project-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="project-description"
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Color</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Project color">
              {PROJECT_COLORS.map((token) => (
                <button
                  key={token}
                  type="button"
                  role="radio"
                  aria-checked={color === token}
                  aria-label={token}
                  onClick={() => setColor(token)}
                  data-testid={`color-${token}`}
                  className={cn(
                    'h-7 w-7 rounded-full ring-offset-2 transition-transform',
                    colorSwatch(token),
                    color === token
                      ? 'ring-2 ring-ring'
                      : 'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                />
              ))}
            </div>
          </div>

          {error ? (
            <span role="alert" className="text-xs text-destructive">
              {error}
            </span>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} data-testid="project-submit">
              {mode === 'edit' ? 'Save changes' : 'Create project'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
