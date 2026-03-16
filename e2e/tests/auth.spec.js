// AUTH — Login, session, returning user, team isolation
const { test, expect } = require('@playwright/test');
const { login, clearSession, BASE } = require('./helpers');

test.describe('AUTH — Login', () => {

  test('AUTH-001: fresh login form shown when no session exists', async ({ page }) => {
    await clearSession(page);
    await expect(page.getByPlaceholder('e.g. alice')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('AUTH-002: alice logs in successfully — app shell visible', async ({ page }) => {
    await login(page, 'alice', 'password');
    await expect(page.getByRole('button', { name: /Files/i })).toBeVisible();
    await expect(page.getByText('Alice Chen')).toBeVisible();
  });

  test('AUTH-003: bob logs in successfully — app shell visible', async ({ page }) => {
    await login(page, 'bob', 'password');
    await expect(page.getByRole('button', { name: /Files/i })).toBeVisible();
    await expect(page.getByText('Bob Smith')).toBeVisible();
  });

  test('AUTH-004: rita logs in successfully — app shell visible', async ({ page }) => {
    await login(page, 'rita', 'password');
    await expect(page.getByRole('button', { name: /Files/i })).toBeVisible();
    await expect(page.getByText('Rita Patel')).toBeVisible();
  });

  test('AUTH-005: wrong password shows error message', async ({ page }) => {
    await clearSession(page);
    await page.getByPlaceholder('e.g. alice').fill('alice');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    // Actual error text from the app: "Login failed. Please try again."
    await expect(page.getByText(/login failed|invalid|incorrect/i)).toBeVisible({ timeout: 8000 });
    // Must stay on login page
    await expect(page.getByPlaceholder('e.g. alice')).toBeVisible();
  });

  test('AUTH-006: unknown username shows error message', async ({ page }) => {
    await clearSession(page);
    await page.getByPlaceholder('e.g. alice').fill('nobody');
    await page.locator('input[type="password"]').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText(/login failed|invalid|incorrect|not found/i)).toBeVisible({ timeout: 8000 });
  });

  test('AUTH-007: empty fields — HTML required validation prevents submit', async ({ page }) => {
    await clearSession(page);
    await page.getByRole('button', { name: 'Sign In' }).click();
    // HTML5 required blocks form — stays on login
    await expect(page.getByPlaceholder('e.g. alice')).toBeVisible();
    await expect(page.getByRole('button', { name: /Files/i })).not.toBeVisible();
  });

  test('AUTH-008: returning user card shown on second visit', async ({ page }) => {
    await login(page, 'alice', 'password');
    // Stay on BASE — reload triggers the returning-user card (SPA, no /login route)
    await page.goto(BASE);
    await page.waitForTimeout(500);
    // Returning user card shows alice's name and one-click Sign in
    await expect(page.getByText('Alice Chen')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    // Full form inputs should NOT be shown
    await expect(page.getByPlaceholder('e.g. alice')).not.toBeVisible();
  });

  test('AUTH-009: "Not you? Sign in differently" clears session and shows full form', async ({ page }) => {
    await login(page, 'alice', 'password');
    await page.goto(BASE);
    await page.waitForTimeout(500);
    // Click "Not you?" link
    await page.getByText(/not you/i).click();
    await expect(page.getByPlaceholder('e.g. alice')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('AUTH-010: after login, team badge shows correct team name', async ({ page }) => {
    await login(page, 'alice', 'password');
    await expect(page.getByText('Team Alpha')).toBeVisible();
  });

  test('AUTH-011: rita sees Team Beta in header', async ({ page }) => {
    await login(page, 'rita', 'password');
    await expect(page.getByText('Team Beta')).toBeVisible();
  });

  test('AUTH-012: Sign out clears session and shows login form', async ({ page }) => {
    await login(page, 'alice', 'password');
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByPlaceholder('e.g. alice')).toBeVisible({ timeout: 5000 });
  });

  test('AUTH-013: one-click returning user sign-in works without re-entering credentials', async ({ page }) => {
    await login(page, 'alice', 'password');
    // Reload BASE — returning user card appears
    await page.goto(BASE);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // App shell should be visible immediately (no API call needed — token in localStorage)
    await expect(page.getByRole('button', { name: /Files/i })).toBeVisible({ timeout: 5000 });
  });

});
