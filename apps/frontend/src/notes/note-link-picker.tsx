import { useMemo, useState, type ReactNode } from 'react';
import type { Project, Task } from '@workboard/shared';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

export interface NoteLinkPickerProps {
  projects: Project[];
  tasks: Task[];
  /** Ids already linked — excluded from the picker so duplicates can't be added (US3.4). */
  selectedProjectIds: string[];
  selectedTaskIds: string[];
  onPick: (kind: 'project' | 'task', id: string) => void;
  onClose: () => void;
}

/**
 * Link picker (contracts §Linking a note, US3.1/US3.4). Search/select over the user's **own**
 * projects and tasks (passed in — always the caller's data, never another user's), with
 * already-linked items filtered out so a duplicate can't be picked. Built from the shared design
 * tokens as a lightweight modal.
 */
export function NoteLinkPicker({
  projects,
  tasks,
  selectedProjectIds,
  selectedTaskIds,
  onPick,
  onClose,
}: NoteLinkPickerProps) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const availableProjects = useMemo(
    () =>
      projects
        .filter((p) => !selectedProjectIds.includes(p.id))
        .filter((p) => !q || p.name.toLowerCase().includes(q)),
    [projects, selectedProjectIds, q],
  );
  const availableTasks = useMemo(
    () =>
      tasks
        .filter((t) => !selectedTaskIds.includes(t.id))
        .filter((t) => !q || t.title.toLowerCase().includes(q)),
    [tasks, selectedTaskIds, q],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Link a project or task"
        data-testid="note-link-picker"
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects and tasks"
          aria-label="Search projects and tasks to link"
          data-testid="link-picker-search"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-auto">
          <Section title="Projects" empty="No matching projects">
            {availableProjects.map((p) => (
              <PickRow
                key={p.id}
                label={p.name}
                testid="link-pick-project"
                onClick={() => onPick('project', p.id)}
              />
            ))}
          </Section>
          <Section title="Tasks" empty="No matching tasks">
            {availableTasks.map((t) => (
              <PickRow
                key={t.id}
                label={t.title}
                testid="link-pick-task"
                onClick={() => onPick('task', t.id)}
              />
            ))}
          </Section>
        </div>

        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children.length === 0 ? (
        <p className="px-1 py-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </div>
  );
}

function PickRow({
  label,
  testid,
  onClick,
}: {
  label: string;
  testid: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        data-testid={testid}
        className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
      >
        {label}
      </button>
    </li>
  );
}
