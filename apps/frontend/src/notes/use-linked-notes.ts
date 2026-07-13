import { useEffect, useMemo, useState } from 'react';
import type { Note } from '@workboard/shared';
import { useAuth } from '../auth/use-auth';
import { createNotesClient } from './notes-client';

export type LoadStatus = 'loading' | 'ready' | 'error';

export type LinkedNotesRef = { projectId: string } | { taskId: string };

/**
 * Reverse-lookup hook (contracts §Linked notes on projects & tasks, FR-011). Given a
 * `projectId` or `taskId`, loads the owner's notes linked to it via the reverse `GET /notes`
 * read and exposes them with a load status and a defined empty state (US4.4). Because links are
 * single-sourced on the note (research §2), this always agrees with the note's own link panel.
 */
export function useLinkedNotes(ref: LinkedNotesRef) {
  const { apiClient } = useAuth();
  const client = useMemo(() => createNotesClient(apiClient), [apiClient]);

  const projectId = 'projectId' in ref ? ref.projectId : undefined;
  const taskId = 'taskId' in ref ? ref.taskId : undefined;

  const [notes, setNotes] = useState<Note[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    setLoadStatus('loading');
    (async () => {
      try {
        const loaded =
          projectId !== undefined
            ? await client.listByLinkedProject(projectId)
            : taskId !== undefined
              ? await client.listByLinkedTask(taskId)
              : [];
        if (cancelled) return;
        setNotes(loaded);
        setLoadStatus('ready');
      } catch {
        if (!cancelled) setLoadStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, projectId, taskId]);

  return { notes, loadStatus, isEmpty: loadStatus === 'ready' && notes.length === 0 };
}
