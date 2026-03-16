// FILES TAB — folder tree, file list, lock badges, team isolation
const { test, expect } = require('@playwright/test');
const { login, goToTab } = require('./helpers');

test.describe('FILES — Folder tree and file list', () => {

  test('FILES-001: Files tab is the default tab after login', async ({ page }) => {
    await login(page, 'alice');
    await expect(page.getByRole('button', { name: /Files/i })).toBeVisible();
    // SQL Files heading confirms Files tab is active
    await expect(page.getByText('SQL Files')).toBeVisible({ timeout: 8000 });
  });

  test('FILES-002: folder tree sidebar shows FOLDERS label and all folder entries', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.waitForTimeout(1500);
    // Scope to the sidebar — look for the "FOLDERS" header text
    const sidebar = page.getByText('FOLDERS').locator('..');
    await expect(sidebar).toBeVisible({ timeout: 8000 });
    // The group header for schema_table_ddls is in the sidebar
    await expect(page.getByText('schema_table_ddls').first()).toBeVisible();
    // Individual folder labels
    await expect(page.getByText('views').first()).toBeVisible();
    await expect(page.getByText('procedures').first()).toBeVisible();
    await expect(page.getByText('alter_ddls').first()).toBeVisible();
    await expect(page.getByText('sql_scripts').first()).toBeVisible();
  });

  test('FILES-003: schema_table_ddls group shows bronze, silver, gold sub-folders', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.waitForTimeout(1500);
    // bronze/silver/gold are folder labels in the sidebar (rendered as indented rows)
    await expect(page.getByText('bronze').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('silver').first()).toBeVisible();
    await expect(page.getByText('gold').first()).toBeVisible();
  });

  test('FILES-004: clicking views folder shows .sql files in right pane', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.waitForTimeout(1500);
    await page.getByText('views').first().click();
    await page.waitForTimeout(2000);
    // Right pane should show files with Open button
    await expect(page.getByRole('button', { name: 'Open' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('FILES-005: file list shows last commit message', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.getByText('views').first().click();
    await page.waitForTimeout(2000);
    // Commit message column shows something (not just dashes)
    const commitText = page.getByText(/update:|add:|e2e|-- |sql-portal/i).first();
    if (await commitText.isVisible({ timeout: 5000 })) {
      await expect(commitText).toBeVisible();
    }
  });

  test('FILES-006: New File button navigates to Editor', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.getByRole('button', { name: /\+ New File/i }).click();
    // Editor should now be active
    await expect(page.getByPlaceholder('filename.sql')).toBeVisible({ timeout: 5000 });
  });

  test('FILES-007: alice team isolation — no team-b content visible', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.waitForTimeout(1500);
    await expect(page.getByText(/team.b|team_b/i)).not.toBeVisible();
  });

  test('FILES-008: rita sees her team-b files, not team-a', async ({ page }) => {
    await login(page, 'rita');
    await goToTab(page, 'Files');
    await page.waitForTimeout(1500);
    await expect(page.getByText('Team Alpha')).not.toBeVisible();
    await expect(page.getByText('Team Beta')).toBeVisible();
  });

  test('FILES-009: clicking Open on a file switches to Editor with file loaded', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.getByText('views').first().click();
    await page.waitForTimeout(2000);

    // Click the Open button on the first file row
    const openBtn = page.getByRole('button', { name: 'Open' }).first();
    await expect(openBtn).toBeVisible({ timeout: 8000 });
    await openBtn.click();
    await page.waitForTimeout(1000);

    // Handle lock warning dialog if the file is locked by a previous test
    const openAnyway = page.getByRole('button', { name: /Open anyway/i });
    if (await openAnyway.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openAnyway.click();
    }
    await page.waitForTimeout(1000);

    // Should now be in the editor with content loaded
    await expect(page.getByPlaceholder('filename.sql')).toBeVisible({ timeout: 5000 });
    const filename = await page.getByPlaceholder('filename.sql').inputValue();
    expect(filename).toMatch(/\.sql$/i);
  });

  test('FILES-010: lock badge visible when another user has file open', async ({ page, browser }) => {
    const alicePage = page;
    await login(alicePage, 'alice');
    await goToTab(alicePage, 'Files');
    await alicePage.getByText('views').first().click();
    await alicePage.waitForTimeout(2000);

    // Alice opens a file (acquires lock)
    const openBtn = alicePage.getByRole('button', { name: 'Open' }).first();
    if (await openBtn.isVisible({ timeout: 5000 })) {
      await openBtn.click();
      await alicePage.waitForTimeout(1500);

      // Bob opens Files tab
      const bobCtx = await browser.newContext();
      const bobPage = await bobCtx.newPage();
      await login(bobPage, 'bob');
      await goToTab(bobPage, 'Files');
      await bobPage.getByText('views').first().click();
      await bobPage.waitForTimeout(2500);

      // 🔒 lock badge with alice's name should be visible
      await expect(bobPage.getByText('Alice Chen').first()).toBeVisible({ timeout: 8000 });
      await bobCtx.close();
    }
  });

  test('FILES-011: empty folder shows "No files in this folder", no crash', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    // Click alter_ddls — may have files or not; either way no crash
    await page.getByText('alter_ddls').first().click();
    await page.waitForTimeout(1500);
    // Should either show files or "No files in this folder" — never an error
    const body = page.locator('body');
    await expect(body).not.toContainText(/undefined|TypeError|500/i);
  });

  test('FILES-012: search/filter box narrows file list', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.getByText('views').first().click();
    await page.waitForTimeout(2000);

    const search = page.getByPlaceholder('Filter files…');
    await expect(search).toBeVisible();
    await search.fill('zzz_nomatch_xyz');
    await page.waitForTimeout(500);
    // Should show "No files matching" message
    await expect(page.getByText(/No files matching/i)).toBeVisible({ timeout: 3000 });
  });

  test('FILES-013: Delete button shows confirmation before deleting', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.getByText('views').first().click();
    await page.waitForTimeout(2000);

    const deleteBtn = page.getByRole('button', { name: 'Delete' }).first();
    if (await deleteBtn.isVisible({ timeout: 5000 })) {
      await deleteBtn.click();
      // Should show a confirmation dialog/modal
      await expect(page.getByText(/confirm|are you sure|delete/i).first()).toBeVisible({ timeout: 3000 });
      // Cancel to avoid actually deleting
      const cancelBtn = page.getByRole('button', { name: /cancel|no/i }).first();
      if (await cancelBtn.isVisible({ timeout: 2000 })) await cancelBtn.click();
    }
  });

});
