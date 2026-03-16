// AUTH — Login, session, returning user, team isolation
const { test, expect } = require('@playwright/test');
const { login, clearSession, goToTab, BASE } = require('./helpers');

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
    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 8000 });
    // Should stay on login page
    await expect(page.getByPlaceholder('e.g. alice')).toBeVisible();
  });

  test('AUTH-006: unknown username shows error message', async ({ page }) => {
    await clearSession(page);
    await page.getByPlaceholder('e.g. alice').fill('nobody');
    await page.locator('input[type="password"]').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 8000 });
  });

  test('AUTH-007: empty fields — HTML required validation prevents submit', async ({ page }) => {
    await clearSession(page);
    await page.getByRole('button', { name: 'Sign In' }).click();
    // HTML5 required should block — stays on login
    await expect(page.getByPlaceholder('e.g. alice')).toBeVisible();
    // Nav tabs should NOT appear
    await expect(page.getByRole('button', { name: /Files/i })).not.toBeVisible();
  });

  test('AUTH-008: returning user card shown on second visit', async ({ page }) => {
    await login(page, 'alice', 'password');
    // Go back to login by reloading (session still in localStorage)
    await page.goto(BASE);
    // Should show returning user card with alice's name
    await expect(page.getByText('Alice Chen')).toBeVisible();
    // One-click Sign in button
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    // Should NOT show the username input
    await expect(page.getByPlaceholder('e.g. alice')).not.toBeVisible();
  });

  test('AUTH-009: "Not you? Sign in differently" clears session and shows full form', async ({ page }) => {
    await login(page, 'alice', 'password');
    await page.goto(BASE);
    await page.getByText(/not you/i).click();
    // Full form should appear
    await expect(page.getByPlaceholder('e.g. alice')).toBeVisible();
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
    // Login form should reappear
    await expect(page.getByPlaceholder('e.g. alice')).toBeVisible();
  });

  test('AUTH-013: one-click returning user sign-in works without re-entering credentials', async ({ page }) => {
    await login(page, 'alice', 'password');
    await page.goto(BASE);
    // Click the one-click Sign in button
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Should be in the app immediately
    await expect(page.getByRole('button', { name: /Files/i })).toBeVisible({ timeout: 5000 });
  });

});
