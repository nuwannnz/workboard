import { test, expect } from '@playwright/test';
import {
  E2E_ENABLED,
  E2E_LOCAL,
  registerAndLogin,
  login,
  uniqueEmail,
  createProject,
  addBacklogTask,
} from './support/session';

/**
 * Denial paths (SC-006, FR-016). The unauthenticated redirect runs offline against the
 * frontend alone; the cross-user non-disclosure check drives real auth + persistence and runs
 * under E2E_LOCAL (two fresh accounts) or E2E_LIVE (two seeded accounts). Account B can neither
 * see account A's project nor read its tasks by id — a foreign id resolves as not-found with no
 * disclosure.
 */
test.describe('Projects — access denial', () => {
  test('unauthenticated access to /projects redirects to /login', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('nav-projects')).toHaveCount(0);
  });
});

test.describe('Projects — cross-user isolation', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('one user cannot see or read another user’s project or its tasks', async ({ browser }) => {
    // User A creates a project with a backlog task and captures the project id.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    if (E2E_LOCAL) await registerAndLogin(pageA, uniqueEmail('userA'));
    else
      await login(
        pageA,
        process.env.E2E_TEST_EMAIL as string,
        process.env.E2E_TEST_PASSWORD as string,
      );
    await pageA.getByTestId('nav-projects').click();

    const projectName = `A-only ${Date.now()}`;
    await createProject(pageA, projectName);
    await pageA.getByTestId('projects-grid').getByText(projectName).click();
    await expect(pageA).toHaveURL(/\/projects\/[^/]+$/);
    const projectId = pageA.url().split('/projects/')[1];
    await addBacklogTask(pageA, `A task ${Date.now()}`);

    // User B never sees A's project, and reading A's project by its API returns no tasks.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    if (E2E_LOCAL) await registerAndLogin(pageB, uniqueEmail('userB'));
    else
      await login(
        pageB,
        process.env.E2E_TEST_EMAIL_B as string,
        process.env.E2E_TEST_PASSWORD_B as string,
      );
    await pageB.getByTestId('nav-projects').click();
    await expect(pageB.getByText(projectName)).toHaveCount(0);

    // Direct-navigating to A's project id shows a not-found state (no disclosure of A's data).
    await pageB.goto(`/projects/${projectId}`);
    await expect(pageB.getByText(/could not be found/i)).toBeVisible();
    await expect(pageB.getByText(projectName)).toHaveCount(0);

    // The project-scoped task read for A's id returns an empty list for B (SC-006).
    const tasksForAProject = await pageB.evaluate(async (id) => {
      const raw = window.localStorage.getItem('workboard.auth.tokens');
      const idToken = raw ? (JSON.parse(raw).idToken as string) : '';
      const res = await fetch(`/api/tasks?projectId=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      return res.ok ? await res.json() : { tasks: null, status: res.status };
    }, projectId);
    // Either an empty task list or a benign non-2xx — never any of A's tasks.
    if (Array.isArray(tasksForAProject.tasks)) {
      expect(tasksForAProject.tasks).toEqual([]);
    }

    await ctxA.close();
    await ctxB.close();
  });
});
