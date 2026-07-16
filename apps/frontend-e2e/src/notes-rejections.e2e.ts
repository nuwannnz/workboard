import { test, expect, type Page } from '@playwright/test';
import { E2E_ENABLED, E2E_LOCAL, login, openNotes, createNote } from './support/session';

/**
 * Denial paths (SC-007, FR-018). The unauthenticated redirect runs offline against the frontend
 * alone; the cross-user checks drive real auth + persistence and run under E2E_LOCAL (two fresh
 * accounts) or E2E_LIVE (two seeded accounts). Account B can neither list nor modify account A's
 * note (a foreign id resolves as `404` with no disclosure) and cannot link its own note to A's
 * project (`400 InvalidLinkTarget`).
 */

/** Make an authenticated API call from the page using its stored id token (as the app does). */
function apiFetch(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; ok: boolean; body: unknown }> {
  return page.evaluate(
    async ({ path, init }) => {
      const raw = window.localStorage.getItem('workboard.auth.tokens');
      const idToken = raw ? (JSON.parse(raw).idToken as string) : '';
      const res = await fetch(`/api${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
        },
        ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, body };
    },
    { path, init },
  );
}

test.describe('Notes — access denial', () => {
  test('unauthenticated access to /notes redirects to /login', async ({ page }) => {
    await page.goto('/notes');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('nav-notes')).toHaveCount(0);
  });
});

test.describe('Notes — cross-user isolation', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('account B cannot read or modify account A’s note, nor link to A’s project', async ({
    browser,
  }) => {
    // Account A creates a note and a project; capture both ids from their URLs.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    if (E2E_LOCAL) {
      await openNotes(pageA);
    } else {
      await login(pageA, process.env.E2E_TEST_EMAIL as string, process.env.E2E_TEST_PASSWORD as string);
      await pageA.getByTestId('nav-notes').click();
    }
    await createNote(pageA);
    await expect(pageA).toHaveURL(/\/notes\/[^/]+$/);
    const aNoteId = pageA.url().split('/notes/')[1];
    await pageA.getByTestId('note-title').fill("A's secret note");

    await pageA.getByTestId('nav-projects').click();
    await pageA.getByTestId('new-project').click();
    await pageA.getByTestId('project-name').fill(`A-only ${Date.now()}`);
    await Promise.all([
      pageA.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/projects') && r.ok(),
      ),
      pageA.getByTestId('project-submit').click(),
    ]);
    await pageA.getByTestId('projects-grid').getByText(/A-only/).click();
    await expect(pageA).toHaveURL(/\/projects\/[^/]+$/);
    const aProjectId = pageA.url().split('/projects/')[1];

    // Account B, a separate session.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    if (E2E_LOCAL) {
      await openNotes(pageB);
    } else {
      await login(
        pageB,
        process.env.E2E_TEST_EMAIL_B as string,
        process.env.E2E_TEST_PASSWORD_B as string,
      );
      await pageB.getByTestId('nav-notes').click();
    }

    // B's own note list contains none of A's notes.
    const bList = await apiFetch(pageB, '/notes');
    expect(bList.status).toBe(200);
    const bNotes = (bList.body as { notes: { id: string }[] }).notes;
    expect(bNotes.some((n) => n.id === aNoteId)).toBe(false);

    // B cannot READ A's note body — GET /notes/:idA resolves as 404 (Scenario G, FR-011/SC-007).
    // The S3 body key is derived solely from B's own userId, so B can never address A's object.
    const getForeign = await apiFetch(pageB, `/notes/${aNoteId}`);
    expect(getForeign.status).toBe(404);

    // B cannot modify A's note — a foreign id is 404 with no disclosure.
    const patchForeign = await apiFetch(pageB, `/notes/${aNoteId}`, {
      method: 'PATCH',
      body: { title: 'hacked' },
    });
    expect(patchForeign.status).toBe(404);

    // B creates its own note, then cannot link it to A's project (400 InvalidLinkTarget).
    await createNote(pageB);
    await expect(pageB).toHaveURL(/\/notes\/[^/]+$/);
    const bNoteId = pageB.url().split('/notes/')[1];
    const linkForeign = await apiFetch(pageB, `/notes/${bNoteId}`, {
      method: 'PATCH',
      body: { linkedProjectIds: [aProjectId] },
    });
    expect(linkForeign.status).toBe(400);
    expect((linkForeign.body as { error: string }).error).toBe('InvalidLinkTarget');

    await ctxA.close();
    await ctxB.close();
  });
});
