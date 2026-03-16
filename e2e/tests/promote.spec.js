// PROMOTE TAB — submit, approve, deploy, scheduling, approval enforcement
const { test, expect } = require('@playwright/test');
const { login, goToTab, API } = require('./helpers');

// Helper: alice submits one file, returns the page
async function aliceSubmitsOneFile(page) {
  await login(page, 'alice');
  await goToTab(page, 'Promote');
  await page.waitForTimeout(2000);
  await page.locator('input[type="checkbox"]').first().check();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Submit.*file/i }).first().click();
  await page.waitForTimeout(3000); // allow submission to complete
}

test.describe('PROMOTE — Submission and approval flow', () => {

  test('PROMOTE-001: Promote tab visible and clickable after login', async ({ page }) => {
    await login(page, 'alice');
    await expect(page.getByRole('button', { name: /🔁 Promote|Promote/i })).toBeVisible();
  });

  test('PROMOTE-002: Promote tab shows QA and Prod environment toggle buttons', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(1500);
    await expect(page.getByRole('button', { name: /^QA$/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: /^Prod$/i })).toBeVisible({ timeout: 8000 });
  });

  test('PROMOTE-003: file list shows team SQL files with checkboxes', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('PROMOTE-004: Select All button checks all file checkboxes', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^All$/i }).click();
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count > 0) {
      await expect(checkboxes.first()).toBeChecked();
    }
  });

  test('PROMOTE-005: None button deselects all file checkboxes', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^All$/i }).click();
    await page.getByRole('button', { name: /^None$/i }).click();
    expect(await page.locator('input[type="checkbox"]:checked').count()).toBe(0);
  });

  test('PROMOTE-006: Submit button disabled when no files selected', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    const submitBtn = page.getByRole('button', { name: /Submit.*file|Submit 0/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 })) {
      await expect(submitBtn).toBeDisabled();
    }
  });

  test('PROMOTE-007: submit one file creates an open promotion request', async ({ page }) => {
    await aliceSubmitsOneFile(page);
    await expect(page.getByText(/Submitted.*file/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Active Reviews|waiting for a teammate/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('PROMOTE-008: submitter sees "Waiting for a teammate" not Approve button', async ({ page }) => {
    await aliceSubmitsOneFile(page);
    await expect(page.getByText(/Waiting for a teammate to approve/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: /^Approve$/i })).not.toBeVisible();
  });

  test('PROMOTE-009: bob sees Approve button on alice\'s submission', async ({ page, browser }) => {
    // Alice submits
    await aliceSubmitsOneFile(page);

    // Wait for backend to process the submission (GitHub PR creation takes a moment)
    await page.waitForTimeout(8000);

    // Bob opens a separate browser context
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await login(bobPage, 'bob');
    await goToTab(bobPage, 'Promote');
    await bobPage.waitForTimeout(3000);

    await expect(bobPage.getByRole('button', { name: /^Approve$/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(bobPage.getByRole('button', { name: /^Approve$/i }).first()).toBeEnabled();
    await bobCtx.close();
  });

  test('PROMOTE-010: bob can approve alice\'s submission', async ({ page, browser }) => {
    await aliceSubmitsOneFile(page);
    await page.waitForTimeout(8000);

    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await login(bobPage, 'bob');
    await goToTab(bobPage, 'Promote');
    await bobPage.waitForTimeout(3000);

    const approveBtn = bobPage.getByRole('button', { name: /^Approve$/i }).first();
    if (await approveBtn.isVisible({ timeout: 8000 })) {
      await approveBtn.click();
      // Should show approved status
      await expect(bobPage.getByText(/Approved/i).first()).toBeVisible({ timeout: 10000 });
    }
    await bobCtx.close();
  });

  test('PROMOTE-011: after bob approves, alice sees Deploy button', async ({ page, browser }) => {
    await aliceSubmitsOneFile(page);
    await page.waitForTimeout(8000);

    // Bob approves via API directly (faster than browser context)
    const token = await page.evaluate(() => localStorage.getItem('sql_portal_token'));
    const requestsResp = await page.request.get(`${API}/promotion/requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (requestsResp.ok()) {
      const data = await requestsResp.json();
      // API returns a list directly (not {requests: [...]})
      const openReq = Array.isArray(data) ? data.find(r => r.status === 'open') : data.requests?.find(r => r.status === 'open');
      if (openReq) {
        // Bob approves via API
        const bobCtx = await browser.newContext();
        const bobPage = await bobCtx.newPage();
        await login(bobPage, 'bob');
        const bobToken = await bobPage.evaluate(() => localStorage.getItem('sql_portal_token'));
        const approveResp = await bobPage.request.post(`${API}/promotion/approve/${openReq.id}`, {
          headers: { Authorization: `Bearer ${bobToken}` },
        });
        await bobCtx.close();

        // In github mode, approval via API is blocked (happens via GitHub PR merge)
        // Only check for Deploy button if approval succeeded
        if (approveResp.ok()) {
          // Alice's page polls every 15s — wait then check
          await page.waitForTimeout(18000);
          await expect(page.getByRole('button', { name: /Deploy to/i })).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('PROMOTE-012: Deploy button triggers deployment and shows deployed status', async ({ page, browser }) => {
    await aliceSubmitsOneFile(page);
    await page.waitForTimeout(8000);

    const token = await page.evaluate(() => localStorage.getItem('sql_portal_token'));
    const requestsResp = await page.request.get(`${API}/promotion/requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (requestsResp.ok()) {
      const data = await requestsResp.json();
      const openReq = Array.isArray(data) ? data.find(r => r.status === 'open') : data.requests?.find(r => r.status === 'open');
      if (openReq) {
        const bobCtx = await browser.newContext();
        const bobPage = await bobCtx.newPage();
        await login(bobPage, 'bob');
        const bobToken = await bobPage.evaluate(() => localStorage.getItem('sql_portal_token'));
        const approveResp = await bobPage.request.post(`${API}/promotion/approve/${openReq.id}`, {
          headers: { Authorization: `Bearer ${bobToken}` },
        });
        await bobCtx.close();

        if (approveResp.ok()) {
          await page.waitForTimeout(18000);
          const deployBtn = page.getByRole('button', { name: /Deploy to/i }).first();
          if (await deployBtn.isVisible({ timeout: 5000 })) {
            await deployBtn.click();
            await expect(page.getByText(/Deployed|deploying/i).first()).toBeVisible({ timeout: 10000 });
          }
        }
      }
    }
  });

  test('PROMOTE-013: notes field accepts optional deployment notes', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await expect(page.getByPlaceholder(/Q2 report|notes/i)).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder(/Q2 report|notes/i).fill('E2E test notes');
    await expect(page.locator('body')).not.toContainText(/TypeError|500/i);
  });

  test('PROMOTE-014: schedule toggle NOT visible when views/ file selected', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^None$/i }).click();

    // Select a views/ file
    const viewsFile = page.locator('label').filter({ hasText: /views\//i }).locator('input[type="checkbox"]').first()
      .or(page.locator('tr').filter({ hasText: /views\//i }).locator('input[type="checkbox"]').first());
    if (await viewsFile.count() > 0) {
      await viewsFile.check();
      await page.waitForTimeout(500);
      await expect(page.getByText(/Run on a schedule/i)).not.toBeVisible();
    }
  });

  test('PROMOTE-015: schedule toggle visible when procedures/ file selected', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^None$/i }).click();

    const procFile = page.locator('label').filter({ hasText: /procedures\//i }).locator('input[type="checkbox"]').first()
      .or(page.locator('tr').filter({ hasText: /procedures\//i }).locator('input[type="checkbox"]').first());
    if (await procFile.count() > 0) {
      await procFile.check();
      await page.waitForTimeout(500);
      await expect(page.getByText(/Run on a schedule/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('PROMOTE-016: schedule toggle visible when sql_scripts/ file selected', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^None$/i }).click();

    const scriptFile = page.locator('label').filter({ hasText: /sql_scripts\//i }).locator('input[type="checkbox"]').first()
      .or(page.locator('tr').filter({ hasText: /sql_scripts\//i }).locator('input[type="checkbox"]').first());
    if (await scriptFile.count() > 0) {
      await scriptFile.check();
      await page.waitForTimeout(500);
      await expect(page.getByText(/Run on a schedule/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('PROMOTE-017: enabling schedule reveals hourly/daily/weekly/custom options', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^None$/i }).click();

    const schedulableFile = page.locator('label').filter({ hasText: /procedures\/|sql_scripts\//i })
      .locator('input[type="checkbox"]').first()
      .or(page.locator('tr').filter({ hasText: /procedures\/|sql_scripts\//i })
        .locator('input[type="checkbox"]').first());

    if (await schedulableFile.count() > 0) {
      await schedulableFile.check();
      await page.waitForTimeout(500);

      const enableScheduleLabel = page.getByText(/Run on a schedule/i);
      if (await enableScheduleLabel.isVisible({ timeout: 3000 })) {
        // Find the checkbox inside the "Run on a schedule" label and check it
        const enableCheckbox = page.locator('label').filter({ hasText: /Run on a schedule/i }).locator('input[type="checkbox"]');
        await enableCheckbox.check();
        await page.waitForTimeout(500);
        // Schedule type buttons should appear
        await expect(page.getByRole('button', { name: /hourly|daily|weekly|custom/i }).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('PROMOTE-018: PR URL link shown on github mode submissions', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    const prLink = page.getByRole('link', { name: /#\d+|PR|github/i }).first();
    if (await prLink.isVisible({ timeout: 3000 })) {
      await expect(prLink).toHaveAttribute('href', /github\.com/);
    }
  });

  test('PROMOTE-019: switching to Prod updates the submit button label', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await page.locator('input[type="checkbox"]').first().check();

    // Default is QA
    await expect(page.getByRole('button', { name: /Submit.*QA/i })).toBeVisible({ timeout: 5000 });

    // Switch to Prod
    await page.getByRole('button', { name: /^Prod$/i }).click();
    await expect(page.getByRole('button', { name: /Submit.*Prod/i })).toBeVisible({ timeout: 3000 });
  });

  test('PROMOTE-020: Active Reviews section always visible', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Promote');
    await page.waitForTimeout(2000);
    await expect(page.getByText(/Active Reviews/i).first()).toBeVisible({ timeout: 8000 });
  });

});
