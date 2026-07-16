import { useEffect, useMemo, useState } from 'react';
import type { Project, Task } from '@workboard/shared';
import { useAuth } from '../auth/use-auth';
import { createProjectsClient } from '../projects/projects-client';
import { createTasksClient } from '../week/tasks-client';

const WIDE_FROM = '0000-01-01';
const WIDE_TO = '9999-12-31';

/**
 * Loads the caller's own projects & tasks **once** for the notes session so the note editor's
 * links panel can resolve linked ids to display names and power the "Add link" picker. Tasks are
 * the union of scheduled tasks (a wide date window) and each project's tasks (covers backlog-only
 * tasks) — a `2 + N`-per-project fan-out.
 *
 * This intentionally lives at the `NotesPage` level rather than inside `NoteLinksPanel`: the
 * editor is keyed on the note id, so a panel-local load re-ran the whole fan-out on **every** note
 * selection. Loading here — where the component stays mounted across selections — collapses that
 * to a single shared load per notes visit. A load failure leaves both lists empty (links still
 * persist; the picker/resolution is simply empty until reload).
 */
export function useNoteLinkData() {
  const { apiClient } = useAuth();
  const projectsClient = useMemo(() => createProjectsClient(apiClient), [apiClient]);
  const tasksClient = useMemo(() => createTasksClient(apiClient), [apiClient]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loadedProjects = await projectsClient.listProjects();
        const scheduled = await tasksClient.listWeek(WIDE_FROM, WIDE_TO);
        const perProject = await Promise.all(
          loadedProjects.map((p) => tasksClient.listByProject(p.id)),
        );
        if (cancelled) return;
        const byId = new Map<string, Task>();
        for (const t of [...scheduled, ...perProject.flat()]) byId.set(t.id, t);
        setProjects(loadedProjects);
        setTasks([...byId.values()]);
      } catch {
        // A load failure just means the picker/resolution is empty; links still persist.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectsClient, tasksClient]);

  return { projects, tasks };
}
