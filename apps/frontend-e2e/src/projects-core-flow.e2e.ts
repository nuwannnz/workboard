import { test, expect } from '@playwright/test';
import {
  E2E_ENABLED,
  openProjects,
  createProject,
  addBacklogTask,
  currentWeekDates,
  waitForTaskWrite,
  waitForProjectWrite,
} from './support/session';

/**
 * Projects core flow (SC-008): create project → open detail → add/complete backlog tasks →
 * progress updates → schedule a task onto the Week board (badge visible) → reorder backlog →
 * edit project → delete-cascade removes the project and its tasks from both views. Runs under
 * E2E_LOCAL (npm run e2e:local) or E2E_LIVE; skips otherwise (the Vitest suites cover logic).
 */
test.describe('Projects — end-to-end core flow', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('create → backlog → progress → schedule → reorder → edit → delete-cascade', async ({
    page,
  }) => {
    await openProjects(page);

    // Empty state, then create a project.
    const projectName = `Launch ${Date.now()}`;
    await createProject(page, projectName);

    // Open its detail view.
    await page.getByTestId('projects-grid').getByText(projectName).click();
    await expect(page.getByTestId('project-title')).toHaveText(projectName);

    // Backlog starts empty at 0%.
    await expect(page.getByTestId('progress-percent')).toHaveText('0%');

    // Add two backlog tasks (no due date).
    const taskA = `Task A ${Date.now()}`;
    const taskB = `Task B ${Date.now()}`;
    await addBacklogTask(page, taskA);
    await addBacklogTask(page, taskB);

    // Persist across reload (backlog-only, owner-scoped).
    await page.reload();
    await expect(page.getByTestId('project-backlog').getByText(taskA)).toBeVisible();
    await expect(page.getByTestId('project-backlog').getByText(taskB)).toBeVisible();

    // Complete one task → progress recomputes to 50%.
    await page.getByTestId('project-backlog').getByText(taskA).click();
    await Promise.all([
      waitForTaskWrite(page),
      page.getByTestId('detail-toggle-complete').click(),
    ]);
    await expect(page.getByTestId('progress-percent')).toHaveText('50%');

    // Schedule task B onto the Week board by setting a due date via the reused dialog.
    const day = currentWeekDates()[2];
    await page.getByTestId('project-backlog').getByText(taskB).click();
    await page.getByTestId('detail-duedate').fill(day);
    await Promise.all([waitForTaskWrite(page), page.getByTestId('detail-save').click()]);

    // On the Week board it shows under that day with the project badge.
    await page.getByTestId('nav-week').click();
    const scheduledCard = page.getByTestId(`day-column-${day}`).getByText(taskB);
    await expect(scheduledCard).toBeVisible();
    await expect(page.getByText(projectName)).toBeVisible(); // project badge

    // Back on the project, edit the project name → persists.
    await page.getByTestId('nav-projects').click();
    await page.getByTestId('projects-grid').getByText(projectName).click();
    const renamed = `${projectName} v2`;
    await page.getByTestId('edit-project').click();
    await page.getByTestId('project-name').fill(renamed);
    await Promise.all([waitForProjectWrite(page), page.getByTestId('project-submit').click()]);
    await expect(page.getByTestId('project-title')).toHaveText(renamed);

    // Delete the project → the warning names the task count, then cascade removes it.
    await page.getByTestId('delete-project').click();
    await expect(page.getByTestId('delete-project-dialog')).toContainText('its 2 tasks');
    await Promise.all([
      waitForProjectWrite(page),
      page.getByTestId('confirm-delete-project').click(),
    ]);

    // Back on the grid, the project is gone; and its scheduled task is gone from the Week board.
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText(renamed)).toHaveCount(0);
    await page.getByTestId('nav-week').click();
    await expect(page.getByTestId(`day-column-${day}`).getByText(taskB)).toHaveCount(0);
  });
});
