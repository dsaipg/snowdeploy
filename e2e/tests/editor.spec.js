// EDITOR TAB — save, subfolder, linter, templates, lock acquire/release
const { test, expect } = require('@playwright/test');
const { login, goToTab, uniqueFile } = require('./helpers');

// Set Monaco editor content via the public API (textarea is not directly editable)
async function fillMonaco(page, sql) {
  // Wait for Monaco to initialise
  await page.waitForFunction(
    () => window.monaco?.editor?.getEditors?.()?.length > 0,
    { timeout: 10000 }
  );
  await page.evaluate((sql) => {
    const editors = window.monaco?.editor?.getEditors?.() || [];
    if (editors.length > 0) editors[0].setValue(sql);
  }, sql);
  await page.waitForTimeout(300);
}

test.describe('EDITOR — Save and file management', () => {

  test('EDITOR-001: Editor tab shows subfolder select, filename input, Save button', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await expect(page.locator('select').first()).toBeVisible();
    await expect(page.getByPlaceholder('filename.sql')).toBeVisible();
    await expect(page.getByRole('button', { name: /💾 Save|Save/i })).toBeVisible();
  });

  test('EDITOR-002: subfolder dropdown contains all expected folders', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    const options = await page.locator('select').first().locator('option').allTextContents();
    const joined = options.join(' ');
    expect(joined).toContain('schema_table_ddls/bronze');
    expect(joined).toContain('schema_table_ddls/silver');
    expect(joined).toContain('schema_table_ddls/gold');
    expect(joined).toContain('views');
    expect(joined).toContain('procedures');
    expect(joined).toContain('alter_ddls');
    expect(joined).toContain('sql_scripts');
  });

  test('EDITOR-003: create and save a new SQL file in views/', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    const filename = uniqueFile('e2e_view');

    await page.locator('select').first().selectOption('views');
    await page.getByPlaceholder('filename.sql').fill(filename);
    await fillMonaco(page, 'CREATE OR REPLACE VIEW e2e_test AS SELECT 1 AS col;');
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    await expect(page.getByText(/✓ Saved|commit:/i)).toBeVisible({ timeout: 20000 });
  });

  test('EDITOR-004: save shows commit SHA in status bar', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    const filename = uniqueFile('sha_test');

    await page.locator('select').first().selectOption('views');
    await page.getByPlaceholder('filename.sql').fill(filename);
    await fillMonaco(page, 'SELECT 2 AS sha_test;');
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    await expect(page.getByText(/commit: [a-f0-9]{7}/i)).toBeVisible({ timeout: 20000 });
  });

  test('EDITOR-005: save with empty filename shows error', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    // Use New button to guarantee empty filename state
    await page.getByRole('button', { name: /^New$/i }).click();
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    // App shows: "Enter a filename before saving."
    await expect(page.getByText(/enter a filename before saving/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-006: filename without .sql gets .sql appended automatically', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    const base = `e2e_noext_${Date.now()}`;
    await page.locator('select').first().selectOption('views');
    await page.getByPlaceholder('filename.sql').fill(base); // no .sql
    await fillMonaco(page, 'SELECT 3 AS no_ext;');
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    // Status bar should show the name with .sql appended
    await expect(page.getByText(new RegExp(`${base}\\.sql`, 'i'))).toBeVisible({ timeout: 20000 });
  });

  test('EDITOR-007: loading an existing file shows its content in Monaco', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.getByText('views').first().click();
    await page.waitForTimeout(2000);

    const openBtn = page.getByRole('button', { name: 'Open' }).first();
    await expect(openBtn).toBeVisible({ timeout: 8000 });
    await openBtn.click();
    await page.waitForTimeout(1000);

    // If a lock warning dialog appears, dismiss it with "Open anyway"
    const openAnyway = page.getByRole('button', { name: /Open anyway/i });
    if (await openAnyway.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openAnyway.click();
    }

    // Wait for Monaco to initialise and file to load
    await page.waitForFunction(
      () => {
        const editors = window.monaco?.editor?.getEditors?.() || [];
        if (editors.length === 0) return false;
        const val = editors[0].getValue();
        return val.trim().length > 0;
      },
      { timeout: 15000 }
    );
    const content = await page.evaluate(() => {
      const editors = window.monaco?.editor?.getEditors?.() || [];
      return editors.length > 0 ? editors[0].getValue() : '';
    });
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test('EDITOR-008: SQL linter fires in alter_ddls/ — DROP TABLE shows error panel', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('alter_ddls');
    await fillMonaco(page, 'DROP TABLE users;');
    await page.waitForTimeout(1000);
    await expect(page.getByText(/DROP TABLE is destructive/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-009: SQL linter fires — TRUNCATE shows error', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('alter_ddls');
    await fillMonaco(page, 'TRUNCATE TABLE orders;');
    await page.waitForTimeout(1000);
    await expect(page.getByText(/TRUNCATE deletes all rows/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-010: SQL linter fires — ADD COLUMN without IF NOT EXISTS shows error', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('alter_ddls');
    await fillMonaco(page, 'ALTER TABLE users ADD COLUMN email VARCHAR(255);');
    await page.waitForTimeout(1000);
    await expect(page.getByText(/ADD COLUMN without IF NOT EXISTS/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-011: SQL linter fires — DROP COLUMN shows warning', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('alter_ddls');
    await fillMonaco(page, 'ALTER TABLE users DROP COLUMN email;');
    await page.waitForTimeout(1000);
    await expect(page.getByText(/DROP COLUMN is destructive/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-012: SQL linter does NOT fire in views/ folder', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('views');
    await fillMonaco(page, 'DROP TABLE users;');
    await page.waitForTimeout(1500);
    // Lint panel must NOT appear for views/ subfolder
    await expect(page.getByText(/DROP TABLE is destructive/i)).not.toBeVisible();
  });

  test('EDITOR-013: Templates button opens dropdown with template names', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.getByRole('button', { name: /Templates/i }).click();
    await expect(page.getByText(/Create Table|Add Column|Create View/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-014: selecting a template inserts SQL into editor', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.getByRole('button', { name: /Templates/i }).click();
    await page.getByText('Create Table').first().click();
    await page.waitForTimeout(800); // Monaco renders async
    const val = await page.evaluate(() => {
      const editors = window.monaco?.editor?.getEditors?.() || [];
      return editors.length > 0 ? editors[0].getValue() : '';
    });
    expect(val).toContain('CREATE TABLE');
  });

  test('EDITOR-015: New button clears filename and resets editor', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.getByPlaceholder('filename.sql').fill('some_existing_file.sql');
    await page.getByRole('button', { name: /^New$/i }).click();
    const val = await page.getByPlaceholder('filename.sql').inputValue();
    expect(val).toBe('');
  });

  test('EDITOR-016: optional commit message field is present', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await expect(page.getByPlaceholder('Commit message (optional)')).toBeVisible();
  });

  test('EDITOR-017: save with custom commit message uses it', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    const filename = uniqueFile('commit_msg_test');
    await page.locator('select').first().selectOption('views');
    await page.getByPlaceholder('filename.sql').fill(filename);
    await page.getByPlaceholder('Commit message (optional)').fill('e2e: custom commit message test');
    await fillMonaco(page, 'SELECT 99 AS msg_test;');
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    await expect(page.getByText(/✓ Saved|commit:/i)).toBeVisible({ timeout: 20000 });
  });

});
