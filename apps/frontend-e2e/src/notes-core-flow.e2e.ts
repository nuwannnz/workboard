import { test, expect } from '@playwright/test';
import {
  E2E_ENABLED,
  openNotes,
  createNote,
  waitForNoteWrite,
} from './support/session';

/**
 * Notes core flow (SC-008): create a note → type a title + formatted Markdown and confirm
 * auto-save (status + persistence on reload with formatting) → link a project & a task → open
 * the project detail and the task and confirm the "Linked notes" section lists and opens the
 * note → rename → delete with the link no longer indicated. Runs under E2E_LOCAL
 * (npm run e2e:local) or E2E_LIVE; skips otherwise (the Vitest suites cover the logic).
 */
test.describe('Notes — end-to-end core flow', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('create → auto-save → link project & task → see/open from work → rename → delete', async ({
    page,
  }) => {
    await openNotes(page);

    // Seed a project and a backlog task to link to (fresh local account has none).
    const projectName = `Proj ${Date.now()}`;
    const taskTitle = `Task ${Date.now()}`;
    await page.getByTestId('nav-projects').click();
    await page.getByTestId('new-project').click();
    await page.getByTestId('project-name').fill(projectName);
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/projects') && r.ok(),
      ),
      page.getByTestId('project-submit').click(),
    ]);
    await page.getByTestId('projects-grid').getByText(projectName).click();
    await expect(page.getByTestId('project-title')).toHaveText(projectName);
    const backlogInput = page.getByTestId('add-backlog-input');
    await backlogInput.fill(taskTitle);
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/tasks') && r.ok(),
      ),
      backlogInput.press('Enter'),
    ]);

    // Create a note.
    await page.getByTestId('nav-notes').click();
    await createNote(page);

    // Type a title + formatted Markdown; auto-save should fire and reach "Saved".
    await page.getByTestId('note-title').fill('My first note');
    await waitForNoteWrite(page, 'PATCH');
    const surface = page.getByTestId('markdown-editor-surface');
    await surface.click();
    await page.keyboard.type('# Heading');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Some body text');
    await waitForNoteWrite(page, 'PATCH');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');

    // Persist across reload, with the heading rendered as WYSIWYG.
    await page.reload();
    await expect(page.getByTestId('note-title')).toHaveValue('My first note');
    await expect(page.getByTestId('markdown-editor-surface').getByText('Heading')).toBeVisible();
    await expect(page.getByTestId('markdown-editor-surface').getByText('Some body text')).toBeVisible();

    // Link the project and the task via the picker.
    await page.getByTestId('add-link').click();
    await Promise.all([
      waitForNoteWrite(page, 'PATCH'),
      page.getByTestId('link-pick-project').filter({ hasText: projectName }).click(),
    ]);
    await Promise.all([
      waitForNoteWrite(page, 'PATCH'),
      page.getByTestId('link-pick-task').filter({ hasText: taskTitle }).click(),
    ]);
    await page.getByRole('button', { name: /done/i }).click();
    await expect(page.getByTestId('linked-project').filter({ hasText: projectName })).toBeVisible();
    await expect(page.getByTestId('linked-task').filter({ hasText: taskTitle })).toBeVisible();

    // Links persist across reload (single-sourced on the note).
    await page.reload();
    await expect(page.getByTestId('linked-project').filter({ hasText: projectName })).toBeVisible();

    // The project detail's "Linked notes" section lists and opens the note.
    await page.getByTestId('nav-projects').click();
    await page.getByTestId('projects-grid').getByText(projectName).click();
    const linkedOnProject = page
      .getByTestId('linked-notes-section')
      .getByTestId('linked-note')
      .filter({ hasText: 'My first note' });
    await expect(linkedOnProject).toBeVisible();

    // The task dialog's "Linked notes" section lists the note too.
    await page.getByTestId('project-backlog').getByText(taskTitle).click();
    await expect(
      page.getByTestId('task-detail-dialog').getByTestId('linked-note').filter({ hasText: 'My first note' }),
    ).toBeVisible();
    // Open the note from the task dialog.
    await page.getByTestId('task-detail-dialog').getByTestId('linked-note').first().click();
    await expect(page).toHaveURL(/\/notes\//);

    // Rename via the title field (auto-saved).
    await page.getByTestId('note-title').fill('Renamed note');
    await Promise.all([waitForNoteWrite(page, 'PATCH'), page.getByTestId('markdown-editor-surface').click()]);
    await expect(page.getByTestId('note-list-item').filter({ hasText: 'Renamed note' })).toBeVisible();

    // Delete with the warning; the link is no longer indicated on the project.
    await page.getByTestId('delete-note').click();
    await Promise.all([
      waitForNoteWrite(page, 'DELETE'),
      page.getByTestId('confirm-delete-note').click(),
    ]);
    await page.getByTestId('nav-projects').click();
    await page.getByTestId('projects-grid').getByText(projectName).click();
    await expect(page.getByTestId('linked-notes-section').getByTestId('linked-notes-empty')).toBeVisible();
  });

  /**
   * SC-002 / FR-013: a note body larger than DynamoDB's 400 KB item limit round-trips intact —
   * impossible while the body lived inline in the metadata item, now that it lives in S3. The
   * reopen after reload proves the select-to-fetch path (`GET /notes/:id`) returns the full body.
   */
  test('large body (>400 KB) round-trips via S3 on reopen', async ({ page }) => {
    await openNotes(page);
    await createNote(page);

    await page.getByTestId('note-title').fill('Big note');
    await waitForNoteWrite(page, 'PATCH');

    // ~540 KB of body — comfortably past the 400 KB DynamoDB item ceiling. insertText dispatches
    // one input event (fast), unlike char-by-char typing. A unique end marker anchors the assert.
    const marker = `END_${Date.now()}`;
    const big = 'lorem ipsum dolor '.repeat(30_000); // ≈ 540 KB
    await page.getByTestId('markdown-editor-surface').click();
    await page.keyboard.insertText(`${big}${marker}`);
    await waitForNoteWrite(page, 'PATCH');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');

    // Reopening the deep-linked note issues GET /notes/:id, which reads the body from S3.
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' && /\/notes\/[^/?]+$/.test(r.url()) && r.ok(),
      ),
      page.reload(),
    ]);
    await expect(page.getByTestId('note-title')).toHaveValue('Big note');
    await expect(page.getByTestId('markdown-editor-surface')).toContainText(marker, {
      timeout: 15_000,
    });
  });

  /**
   * US3 / SC-005: deleting a note removes it from the list and a subsequent open of its deep link
   * returns `404` (metadata gone), degrading to the body-error state rather than a stale editor.
   */
  test('delete removes the note; reopening its deep link 404s', async ({ page }) => {
    await openNotes(page);
    await createNote(page);
    await expect(page).toHaveURL(/\/notes\/[^/]+$/);
    const noteId = page.url().split('/notes/')[1];

    await page.getByTestId('note-title').fill('Doomed');
    await waitForNoteWrite(page, 'PATCH');

    // Delete with the confirm dialog.
    await page.getByTestId('delete-note').click();
    await Promise.all([
      waitForNoteWrite(page, 'DELETE'),
      page.getByTestId('confirm-delete-note').click(),
    ]);
    await expect(page.getByTestId('note-list-item').filter({ hasText: 'Doomed' })).toHaveCount(0);

    // Reopening the deleted note's deep link fetches GET /notes/:id → 404; the deleted note's
    // editor never loads (with no notes left, the notebook shows its empty state).
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          r.url().includes(`/notes/${noteId}`) &&
          r.status() === 404,
      ),
      page.goto(`/notes/${noteId}`),
    ]);
    await expect(page.getByTestId('note-editor')).toHaveCount(0);
  });
});
