// PROMOTE TAB — submit, approve, deploy, scheduling, approval enforcement
const { test, expect } = require('@playwright/test');
const { login, goToTab } = require('./helpers');

test.describe('PROMOTE — Submission and approval flow', () => {

  test('PROMOTE-001: Promote tab visible and clickable after login', async ({ page }) => {
    await login(page, 'alice');
    await expect(page.getByRole('button', { name: /🔁 Promote|Promote/i })).toBeVisible();
  });

  test('PROMOTE-002: Promote tab shows Dev→QA and QA→Prod environment toggle buttons', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(1500);
    // Should have QA and Prod target env toggle buttons
    await expect(page.getByRole('button', { name: /^QA$/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: /^Prod$/i })).toBeVisible({ timeout: 8000 });
  });

  test('PROMOTE-003: file list shows team SQL files with checkboxes', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('PROMOTE-004: Select All button selects all files', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^All$/i }).click();
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count > 0) {
      // First checkbox should be checked (file selection)
      await expect(checkboxes.first()).toBeChecked();
    }
  });

  test('PROMOTE-005: None button deselects all files', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^All$/i }).click();
    await page.getByRole('button', { name: /^None$/i }).click();
    const checked = page.locator('input[type="checkbox"]:checked');
    expect(await checked.count()).toBe(0);
  });

  test('PROMOTE-006: Submit button disabled when no files selected', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    // Submit button should be disabled when nothing selected
    const submitBtn = page.getByRole('button', { name: /Submit.*file|Submit 0/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 })) {
      await expect(submitBtn).toBeDisabled();
    }
  });

  test('PROMOTE-007: submit one file creates an open promotion request', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    // Select first file
    await page.locator('input[type="checkbox"]').first().check();
    await page.waitForTimeout(300);
    // Click submit
    const submitBtn = page.getByRole('button', { name: /Submit.*file/i }).first();
    await submitBtn.click();
    // Should show success message
    await expect(page.getByText(/Submitted.*file|submitted/i)).toBeVisible({ timeout: 10000 });
    // Active reviews section should show the request
    await expect(page.getByText(/open|waiting for a teammate/i)).toBeVisible({ timeout: 8000 });
  });

  test('PROMOTE-008: submitter (alice) sees "Waiting for a teammate" not Approve button', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /Submit.*file/i }).first().click();
    await page.waitForTimeout(3000);

    // Alice should see "Waiting for a teammate" label on her own submission
    await expect(page.getByText(/Waiting for a teammate to approve/i)).toBeVisible({ timeout: 8000 });
    // Approve button should NOT be visible for alice
    await expect(page.getByRole('button', { name: /^Approve$/i })).not.toBeVisible();
  });

  test('PROMOTE-009: bob sees Approve button on alice\'s submission', async ({ page, browser }) => {
    // Alice submits
    const alicePage = page;
    await login(alicePage, 'alice');
    await goToTab(alicePage, 'Promote');
    await alicePage.waitForTimeout(2000);
    await alicePage.locator('input[type="checkbox"]').first().check();
    await alicePage.getByRole('button', { name: /Submit.*file/i }).first().click();
    await alicePage.waitForTimeout(3000);

    // Bob opens promote tab
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await login(bobPage, 'bob');
    await goToTab(bobPage, 'Promote');
    await bobPage.waitForTimeout(3000);

    // Bob should see the Approve button
    await expect(bobPage.getByRole('button', { name: /^Approve$/i })).toBeVisible({ timeout: 8000 });
    await expect(bobPage.getByRole('button', { name: /^Approve$/i })).toBeEnabled();
    await bobCtx.close();
  });

  test('PROMOTE-010: mock mode — request auto-approves within 40 seconds', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /Submit.*file/i }).first().click();
    await page.waitForTimeout(2000);

    // Wait up to 40s for auto-approval (mock delay is 30s)
    await expect(page.getByText(/Approved/i).first()).toBeVisible({ timeout: 40000 });
  });

  test('PROMOTE-011: after approval, Deploy button appears', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /Submit.*file/i }).first().click();
    await page.waitForTimeout(2000);

    // Wait for approved status
    await expect(page.getByText(/Approved/i)).toBeVisible({ timeout: 40000 });
    // Deploy button should appear
    await expect(page.getByRole('button', { name: /Deploy to/i })).toBeVisible({ timeout: 5000 });
  });

  test('PROMOTE-012: Deploy button triggers deployment', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /Submit.*file/i }).first().click();
    await page.waitForTimeout(2000);

    await expect(page.getByText(/Approved/i)).toBeVisible({ timeout: 40000 });
    await page.getByRole('button', { name: /Deploy to/i }).first().click();
    await expect(page.getByText(/Deployed|deploying/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('PROMOTE-013: notes field accepts optional deployment notes', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await expect(page.getByPlaceholder(/Q2 report|notes/i)).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder(/Q2 report|notes/i).fill('E2E test notes');
    // Should not cause any error
    await expect(page.locator('body')).not.toContainText(/TypeError|500/i);
  });

  test('PROMOTE-014: scheduling toggle NOT visible when views/ file selected', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    // Select a views/ file (deselect everything else first)
    await page.getByRole('button', { name: /^None$/i }).click();
    const viewsFile = page.locator('label, tr, li').filter({ hasText: /views\//i }).locator('input[type="checkbox"]').first();
    if (await viewsFile.count() > 0) {
      await viewsFile.check();
      await page.waitForTimeout(500);
      // Schedule section should NOT appear
      await expect(page.getByText(/Enable Schedule|cron/i)).not.toBeVisible();
    }
  });

  test('PROMOTE-015: scheduling toggle visible when procedures/ file selected', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /^None$/i }).click();
    const procFile = page.locator('label, tr, li').filter({ hasText: /procedures\//i }).locator('input[type="checkbox"]').first();
    if (await procFile.count() > 0) {
      await procFile.check();
      await page.waitForTimeout(500);
      await expect(page.getByText(/Enable Schedule|schedule/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('PROMOTE-016: scheduling toggle visible when sql_scripts/ file selected', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /^None$/i }).click();
    const scriptFile = page.locator('label, tr, li').filter({ hasText: /sql_scripts\//i }).locator('input[type="checkbox"]').first();
    if (await scriptFile.count() > 0) {
      await scriptFile.check();
      await page.waitForTimeout(500);
      await expect(page.getByText(/Enable Schedule|schedule/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('PROMOTE-017: enable schedule checkbox reveals schedule type options', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /^None$/i }).click();
    const schedulableFile = page.locator('label, tr, li')
      .filter({ hasText: /procedures\/|sql_scripts\//i })
      .locator('input[type="checkbox"]').first();

    if (await schedulableFile.count() > 0) {
      await schedulableFile.check();
      await page.waitForTimeout(500);
      const enableSchedule = page.locator('input[type="checkbox"]').filter({ has: page.getByText(/schedule/i) }).first()
        .or(page.getByText(/Enable Schedule/i).locator('..').locator('input[type="checkbox"]').first());

      if (await enableSchedule.isVisible({ timeout: 2000 })) {
        await enableSchedule.check();
        await page.waitForTimeout(500);
        // Schedule type buttons should appear (hourly, daily, weekly, custom)
        await expect(page.getByRole('button', { name: /hourly|daily|weekly|custom/i }).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('PROMOTE-018: PR URL link visible on github mode submissions', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    // If there are open requests, they might have a PR link
    const prLink = page.getByRole('link', { name: /#\d+|PR|github/i }).first();
    if (await prLink.isVisible({ timeout: 3000 })) {
      await expect(prLink).toHaveAttribute('href', /github\.com/);
    }
  });

  test('PROMOTE-019: switching from QA to Prod target env updates submit button label', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);

    // Default is QA
    await page.locator('input[type="checkbox"]').first().check();
    const submitBtnQA = page.getByRole('button', { name: /Submit.*QA/i }).first();
    await expect(submitBtnQA).toBeVisible({ timeout: 5000 });

    // Switch to Prod
    await page.getByRole('button', { name: /^Prod$/i }).click();
    const submitBtnProd = page.getByRole('button', { name: /Submit.*Prod/i }).first();
    await expect(submitBtnProd).toBeVisible({ timeout: 3000 });
  });

  test('PROMOTE-020: Active Reviews section shows open requests', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    // Active reviews section header should be visible
    await expect(page.getByText(/Active Reviews|active review/i).first()).toBeVisible({ timeout: 8000 });
  });

});
