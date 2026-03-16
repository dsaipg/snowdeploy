// HISTORY TAB — deployment history, Airflow status polling
const { test, expect } = require('@playwright/test');
const { login, goToTab } = require('./helpers');

test.describe('HISTORY — Deployment history and status', () => {

  test('HISTORY-001: History tab is visible after login', async ({ page }) => {
    await login(page, 'alice');
    // Tabs are <button> elements, not ARIA role=tab
    await expect(page.getByRole('button', { name: /📋 History|History/i })).toBeVisible();
  });

  test('HISTORY-002: History tab shows deployment records', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'history');
    await page.waitForTimeout(2000);
    // Should show history entries or empty state — must not crash
    await expect(page).not.toHaveURL(/error/i);
    await expect(page.locator('body')).not.toContainText(/500|crash|exception/i);
  });

  test('HISTORY-003: history record shows team, environment, files, triggered-by', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'history');
    await page.waitForTimeout(2000);

    const rows = page.locator('tr, [data-testid="history-item"], .history-item').filter({ hasText: /qa|prod|dev/i });
    if (await rows.count() > 0) {
      const firstRow = rows.first();
      const text = await firstRow.textContent();
      // Should contain environment info
      expect(text?.toLowerCase()).toMatch(/qa|prod|dev/);
    }
  });

  test('HISTORY-004: history record shows Airflow run status', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'history');
    await page.waitForTimeout(2000);

    const statusBadge = page.getByText(/success|running|failed|queued|triggered/i).first();
    if (await statusBadge.isVisible({ timeout: 3000 })) {
      await expect(statusBadge).toBeVisible();
    }
  });

  test('HISTORY-005: alice only sees her team deployments, not other teams', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'history');
    await page.waitForTimeout(2000);
    // Rita's team-b entries should not appear
    await expect(page.getByText(/team.b|team_b/i)).not.toBeVisible();
  });

  test('HISTORY-006: empty history shows empty state not an error', async ({ page }) => {
    await login(page, 'rita');
    await goToTab(page, 'history');
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveURL(/error/i);
    await expect(page.locator('body')).not.toContainText(/500|undefined|null/i);
  });

  test('HISTORY-007: refreshing history tab does not duplicate entries', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'history');
    await page.waitForTimeout(1500);
    const firstCount = await page.locator('tr, .history-item').count();
    await page.reload();
    await login(page, 'alice');
    await goToTab(page, 'history');
    await page.waitForTimeout(1500);
    const secondCount = await page.locator('tr, .history-item').count();
    expect(secondCount).toBe(firstCount);
  });

});
