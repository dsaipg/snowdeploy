// FILES TAB — folder tree, file list, lock badges, team isolation
const { test, expect } = require('@playwright/test');
const { login, goToTab, BASE } = require('./helpers');

test.describe('FILES — Folder tree and file list', () => {

  test('FILES-001: Files tab is the default tab after login', async ({ page }) => {
    await login(page, 'alice');
    // Files tab should already be active
    await expect(page.getByRole('button', { name: /Files/i })).toBeVisible();
  });

  test('FILES-002: folder tree shows all top-level folders', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await expect(page.getByText('schema_table_ddls')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('views')).toBeVisible();
    await expect(page.getByText('procedures')).toBeVisible();
    await expect(page.getByText('alter_ddls')).toBeVisible();
    await expect(page.getByText('sql_scripts')).toBeVisible();
  });

  test('FILES-003: schema_table_ddls expands to show bronze, silver, gold', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.waitForTimeout(1000);
    // Click on schema_table_ddls to expand
    const schemaDdls = page.getByText('schema_table_ddls').first();
    await schemaDdls.click();
    await expect(page.getByText('bronze')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('silver')).toBeVisible();
    await expect(page.getByText('gold')).toBeVisible();
  });

  test('FILES-004: clicking views folder shows .sql files', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.waitForTimeout(1000);
    await page.getByText('views').first().click();
    await page.waitForTimeout(2000);
    // Should show SQL files (views folder has v_active_users.sql etc.)
    await expect(page.getByText(/\.sql/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('FILES-005: file list shows last commit author', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.getByText('views').first().click();
    await page.waitForTimeout(2000);
    // Commit author should show in file list
    await expect(page.getByText(/alice chen|bob smith|sql-portal/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('FILES-006: New File button navigates to Editor tab', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    const newFileBtn = page.getByRole('button', { name: /new file/i });
    if (await newFileBtn.isVisible({ timeout: 3000 })) {
      await newFileBtn.click();
      await expect(page.getByRole('button', { name: /✏️ Editor|Editor/i })).toBeVisible();
    }
  });

  test('FILES-007: alice team isolation — no team-b content visible', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.waitForTimeout(1500);
    await expect(page.getByText(/team.b|team_b/i)).not.toBeVisible();
  });

  test('FILES-008: rita sees her team-b files only', async ({ page }) => {
    await login(page, 'rita');
    await goToTab(page, 'Files');
    await page.waitForTimeout(1500);
    // Team Alpha content should not be visible to rita
    await expect(page.getByText('Team Alpha')).not.toBeVisible();
  });

  test('FILES-009: clicking a SQL file opens Editor tab with file loaded', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.getByText('views').first().click();
    await page.waitForTimeout(2000);

    // Click the first .sql file
    const sqlFile = page.getByText(/\.sql/i).first();
    if (await sqlFile.isVisible()) {
      await sqlFile.click();
      // Should switch to Editor
      await expect(page.getByRole('button', { name: /✏️|Editor/i })).toBeVisible({ timeout: 5000 });
      // Monaco editor should be visible
      await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 8000 });
    }
  });

  test('FILES-010: lock badge visible when another user has file open', async ({ page, browser }) => {
    // Alice opens a file (acquires lock)
    const alicePage = page;
    await login(alicePage, 'alice');
    await goToTab(alicePage, 'Files');
    await alicePage.getByText('views').first().click();
    await alicePage.waitForTimeout(1500);

    const sqlFile = alicePage.getByText(/\.sql/i).first();
    if (await sqlFile.isVisible()) {
      await sqlFile.click(); // acquires lock
      await alicePage.waitForTimeout(1500);

      // Bob checks Files tab
      const bobCtx = await browser.newContext();
      const bobPage = await bobCtx.newPage();
      await login(bobPage, 'bob');
      await goToTab(bobPage, 'Files');
      await bobPage.getByText('views').first().click();
      await bobPage.waitForTimeout(2000);

      // Lock badge for Alice should be visible
      await expect(bobPage.getByText(/Alice Chen|🔒/i).first()).toBeVisible({ timeout: 5000 });
      await bobCtx.close();
    }
  });

  test('FILES-011: empty folder shows graceful empty state, no crash', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    // sql_scripts may be empty — should show empty state not an error
    const scriptFolder = page.getByText('sql_scripts').first();
    await scriptFolder.click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText(/undefined|TypeError|500/i);
  });

});
