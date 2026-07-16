import type { Request, Response } from 'express';
import { createNoteSchema, updateNoteSchema } from '@workboard/shared';
import { NotesService, InvalidLinkTargetError } from './notes.service';

/**
 * Notes controller — thin HTTP adapter (Principle I). Validates the body with the shared
 * schemas, reads **only** `req.auth.userId` (the resolved app owner — never caller input),
 * delegates to the service, and maps outcomes to the uniform `201/200/204/400/404/500`
 * responses (contracts/notes-api.md). No business logic here.
 */
export class NotesController {
  constructor(private readonly service: NotesService = new NotesService()) {}

  private static userId(req: Request, res: Response): string | undefined {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return undefined;
    }
    return userId;
  }

  /**
   * `GET /notes` → `{ notes }` for the owner (recency-sorted), **or** a reverse linked-notes
   * lookup via `?linkedProjectId=` / `?linkedTaskId=` (mutually exclusive with the plain list).
   */
  list = async (req: Request, res: Response): Promise<void> => {
    const userId = NotesController.userId(req, res);
    if (!userId) return;
    const linkedProjectId = req.query.linkedProjectId;
    const linkedTaskId = req.query.linkedTaskId;
    try {
      let notes;
      if (typeof linkedProjectId === 'string') {
        notes = await this.service.listByLinkedProject(userId, linkedProjectId);
      } else if (typeof linkedTaskId === 'string') {
        notes = await this.service.listByLinkedTask(userId, linkedTaskId);
      } else {
        notes = await this.service.listNotes(userId);
      }
      res.status(200).json({ notes });
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /**
   * `GET /notes/:id` → `200` with the full note (metadata + `markdown`), `404` if it is not the
   * owner's note (or an unknown id — no disclosure). A missing body object resolves to an empty
   * `markdown`, not a `404` (FR-012), handled in the service.
   */
  getOne = async (req: Request, res: Response): Promise<void> => {
    const userId = NotesController.userId(req, res);
    if (!userId) return;
    try {
      const note = await this.service.getNoteById(userId, req.params.id);
      if (!note) {
        res.status(404).json({ error: 'NotFound' });
        return;
      }
      res.status(200).json(note);
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /** `POST /notes` → `201` with the created note (may be empty). */
  create = async (req: Request, res: Response): Promise<void> => {
    const userId = NotesController.userId(req, res);
    if (!userId) return;
    const parsed = createNoteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
      return;
    }
    try {
      const note = await this.service.createNote(userId, parsed.data);
      res.status(201).json(note);
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /**
   * `PATCH /notes/:id` → `200` with the updated note, `404` if not the owner's, `400` on an
   * invalid body or an invalid link target (a project/task the user does not own).
   */
  update = async (req: Request, res: Response): Promise<void> => {
    const userId = NotesController.userId(req, res);
    if (!userId) return;
    const parsed = updateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
      return;
    }
    try {
      const note = await this.service.updateNote(userId, req.params.id, parsed.data);
      if (!note) {
        res.status(404).json({ error: 'NotFound' });
        return;
      }
      res.status(200).json(note);
    } catch (err) {
      if (err instanceof InvalidLinkTargetError) {
        res.status(400).json({ error: 'InvalidLinkTarget', details: err.ids });
        return;
      }
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /** `DELETE /notes/:id` → `204` on success, `404` if not the owner's. */
  remove = async (req: Request, res: Response): Promise<void> => {
    const userId = NotesController.userId(req, res);
    if (!userId) return;
    try {
      const deleted = await this.service.deleteNote(userId, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'NotFound' });
        return;
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
