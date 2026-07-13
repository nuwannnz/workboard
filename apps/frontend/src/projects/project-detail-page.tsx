import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Task } from '@workboard/shared';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { TaskDetailDialog } from '../week/task-detail-dialog';
import { useProjects } from './use-projects';
import { useProjectTasks } from './use-project-tasks';
import { ProjectBacklog } from './project-backlog';
import { ProgressBar } from './progress-bar';
import { progress } from './progress';
import { colorSwatch } from './project-colors';
import { CreateProjectDialog } from './create-project-dialog';

/**
 * Project detail page (contracts/projects-client-contract.md §project-detail-page). Header
 * shows the project's name/description/color; the body renders the task backlog. Loads the
 * project (from the projects list) and its tasks. US3 layers the progress bar into the header;
 * US5 adds edit + delete-cascade controls. Opening a task reuses the Stage 3 task-detail
 * dialog with an optional/clearable due date.
 */
export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const { projects, loadStatus: projectsStatus, editProject, deleteProject } = useProjects();
  const project = projects.find((p) => p.id === id);

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    backlog,
    loadStatus,
    error,
    reload,
    addBacklogTask,
    editTask,
    toggleComplete,
    deleteTask,
    reorderTask,
  } = useProjectTasks(id);

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const openTask: Task | undefined = backlog.find((t) => t.id === openTaskId);

  // Project not found once the list has loaded (e.g. a foreign/deleted id) → back to grid.
  if (projectsStatus === 'ready' && !project) {
    return (
      <section aria-label="Project" className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">This project could not be found.</p>
          <Button type="button" onClick={() => navigate('/projects')}>
            Back to projects
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Project" className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="self-start text-sm text-muted-foreground underline"
        >
          ← Projects
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {project ? (
              <span
                aria-hidden="true"
                className={cn('h-3 w-3 shrink-0 rounded-full', colorSwatch(project.color))}
              />
            ) : null}
            <h1 className="text-lg font-semibold" data-testid="project-title">
              {project?.name ?? 'Loading…'}
            </h1>
          </div>
          {project ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                data-testid="edit-project"
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
                data-testid="delete-project"
                className="text-destructive hover:text-destructive"
              >
                Delete
              </Button>
            </div>
          ) : null}
        </div>
        {project?.description ? (
          <p className="text-sm text-muted-foreground">{project.description}</p>
        ) : null}
        {/* Progress recomputes from the current backlog on every change — no request (FR-010). */}
        <ProgressBar progress={progress(backlog)} />
      </header>

      {loadStatus === 'error' ? (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-muted-foreground">Could not load this project’s tasks.</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-sm font-medium text-primary underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <ProjectBacklog
            backlog={backlog}
            onAdd={addBacklogTask}
            onOpenTask={(task) => setOpenTaskId(task.id)}
            onReorder={(taskId, index) => void reorderTask(taskId, index)}
          />
        </div>
      )}

      {openTask ? (
        <TaskDetailDialog
          task={openTask}
          onClose={() => setOpenTaskId(null)}
          onEdit={editTask}
          onToggleComplete={toggleComplete}
          onDelete={deleteTask}
        />
      ) : null}

      {editing && project ? (
        <CreateProjectDialog
          mode="edit"
          initial={{ name: project.name, description: project.description, color: project.color }}
          onClose={() => setEditing(false)}
          onSubmit={(values) => editProject(project.id, values)}
        />
      ) : null}

      {confirmingDelete && project ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmingDelete(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete project"
            data-testid="delete-project-dialog"
            className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold">Delete project</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              This removes the project and its {backlog.length}{' '}
              {backlog.length === 1 ? 'task' : 'tasks'}. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={deleting}
                data-testid="confirm-delete-project"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  setDeleting(true);
                  const ok = await deleteProject(project.id);
                  setDeleting(false);
                  if (ok) navigate('/projects');
                  else setConfirmingDelete(false);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default ProjectDetailPage;
