import { expect, type Page } from '@playwright/test';

/**
 * Shared e2e session helpers. The Week specs run in two modes:
 *
 * - **Local** (`E2E_LOCAL=1`, via `npm run e2e:local`): the fully-local stack (DynamoDB Local
 *   + cognito-local, `npm run local`). Each test registers a fresh account and verifies it
 *   with cognito-local's fixed code, so runs are deterministic and self-contained.
 * - **Live** (`E2E_LIVE=1`): a deployed API + a pre-seeded account (`E2E_TEST_EMAIL` …).
 *
 * Without either flag the Week specs skip (the unit/integration suites cover the logic).
 */
export const E2E_LOCAL = process.env.E2E_LOCAL === '1';
export const E2E_LIVE = process.env.E2E_LIVE === '1';
export const E2E_ENABLED = E2E_LOCAL || E2E_LIVE;

/** cognito-local's fixed verification code (see apps/backend/docker-compose.yml). */
const LOCAL_VERIFICATION_CODE = '123456';
const DEFAULT_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'Passw0rd!';

let seq = 0;
/** A unique, valid email per invocation so local runs never collide. */
export function uniqueEmail(prefix = 'week'): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}@example.com`;
}

/** Register → verify (local fixed code) → login, landing on the app shell. Local mode. */
export async function registerAndLogin(
  page: Page,
  email: string,
  password: string = DEFAULT_PASSWORD,
): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/verify/);
  await page.getByLabel('Verification code').fill(LOCAL_VERIFICATION_CODE);
  await page.getByRole('button', { name: /^verify$/i }).click();

  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByTestId('nav-week')).toBeVisible();
}

/** Log in an existing account (live mode). */
export async function login(
  page: Page,
  email: string = process.env.E2E_TEST_EMAIL as string,
  password: string = process.env.E2E_TEST_PASSWORD as string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByTestId('nav-week')).toBeVisible();
}

/**
 * Establish an authenticated session appropriate to the mode and open the Week board.
 * Returns the account's email. In live mode with a second-account test, pass explicit creds
 * to {@link login} instead.
 */
export async function openWeekBoard(page: Page): Promise<string> {
  const email = E2E_LOCAL ? uniqueEmail() : (process.env.E2E_TEST_EMAIL as string);
  if (E2E_LOCAL) {
    await registerAndLogin(page, email);
  } else {
    await login(page, email);
  }
  await page.getByTestId('nav-week').click();
  return email;
}

/**
 * Establish an authenticated session and open the Projects area (`/projects`). Returns the
 * account's email. Mirrors {@link openWeekBoard} but lands on the Projects surface (Stage 4).
 */
export async function openProjects(page: Page): Promise<string> {
  const email = E2E_LOCAL ? uniqueEmail('proj') : (process.env.E2E_TEST_EMAIL as string);
  if (E2E_LOCAL) {
    await registerAndLogin(page, email);
  } else {
    await login(page, email);
  }
  await page.getByTestId('nav-projects').click();
  await expect(page).toHaveURL(/\/projects/);
  return email;
}

/**
 * Create a project via the "New project" dialog and wait for the server `POST /projects` to
 * persist, so the optimistic card is swapped for the real record before subsequent actions.
 */
export async function createProject(page: Page, name: string): Promise<void> {
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name').fill(name);
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/projects') && r.ok(),
    ),
    page.getByTestId('project-submit').click(),
  ]);
  await expect(page.getByTestId('projects-grid').getByText(name)).toBeVisible();
}

/** Add a backlog task by title on the project detail page and wait for its POST to persist. */
export async function addBacklogTask(page: Page, title: string): Promise<void> {
  const input = page.getByTestId('add-backlog-input');
  await input.fill(title);
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/tasks') && r.ok(),
    ),
    input.press('Enter'),
  ]);
  await expect(page.getByTestId('project-backlog').getByText(title)).toBeVisible();
}

/** Wait for the next project mutation (PATCH/DELETE /projects) to be persisted server-side. */
export function waitForProjectWrite(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (r) =>
      ['PATCH', 'DELETE'].includes(r.request().method()) &&
      r.url().includes('/projects') &&
      r.ok(),
  );
}

/**
 * Add a task under `day` via the inline control and wait for the server `POST` to complete,
 * so the optimistic temp card has been swapped for the persisted one (real id). This makes
 * subsequent reload / open / drag actions deterministic rather than racing the write.
 */
export async function addTask(page: Page, day: string, title: string): Promise<void> {
  const input = page.getByTestId(`add-task-input-${day}`);
  await input.fill(title);
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/tasks') && r.ok(),
    ),
    input.press('Enter'),
  ]);
  await expect(page.getByTestId(`day-column-${day}`).getByText(title)).toBeVisible();
}

/** Wait for the next task mutation (PATCH/DELETE) to be persisted server-side. */
export function waitForTaskWrite(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (r) =>
      ['PATCH', 'DELETE'].includes(r.request().method()) &&
      r.url().includes('/tasks') &&
      r.ok(),
  );
}

/**
 * Drag the card `sourceTestId` onto `targetTestId` (a day column or another card) with a
 * stepped mouse gesture. @dnd-kit's PointerSensor needs the pointer to move past its
 * activation distance and then travel in small steps for collision detection to track — a
 * single `dragTo` does not trigger it. Pass `toTop` to aim near the target's top edge (so a
 * same-day drop lands the card above the target).
 */
export async function dragCardTo(
  page: Page,
  sourceTestId: string,
  targetTestId: string,
  opts: { toTop?: boolean } = {},
): Promise<void> {
  const source = await page.getByTestId(sourceTestId).boundingBox();
  const target = await page.getByTestId(targetTestId).boundingBox();
  if (!source || !target) throw new Error('drag source/target not visible');

  const sx = source.x + source.width / 2;
  const sy = source.y + source.height / 2;
  const tx = target.x + target.width / 2;
  const ty = opts.toTop ? target.y + 8 : target.y + target.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy + 12, { steps: 5 }); // exceed activation distance
  await page.mouse.move(tx, ty, { steps: 15 });
  await page.mouse.move(tx, ty, { steps: 3 }); // settle over the target
  await page.mouse.up();
}

/** Local Monday-start week dates (matches the app's week math). */
export function currentWeekDates(): string[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return fmt(d);
  });
}
