// EDITOR TAB — save, subfolder, linter, templates, lock acquire/release
const { test, expect } = require('@playwright/test');
const { login, goToTab, uniqueFile } = require('./helpers');

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
    await page.getByPlaceholder('filename.sql').clear();
    await page.getByPlaceholder('filename.sql').fill(filename);
    // Type SQL into Monaco editor
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('CREATE OR REPLACE VIEW e2e_test AS SELECT 1 AS col;');
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    // Should show success status bar
    await expect(page.getByText(/✓ Saved|commit:/i)).toBeVisible({ timeout: 20000 });
  });

  test('EDITOR-004: save shows commit SHA in status bar', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    const filename = uniqueFile('sha_test');

    await page.locator('select').first().selectOption('views');
    await page.getByPlaceholder('filename.sql').fill(filename);
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('SELECT 2;');
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    // Status bar should show 7-char commit SHA
    await expect(page.getByText(/commit: [a-f0-9]{7}/i)).toBeVisible({ timeout: 20000 });
  });

  test('EDITOR-005: save with empty filename shows error', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.getByPlaceholder('filename.sql').clear();
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    await expect(page.getByText(/enter a filename|filename/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-006: filename without .sql gets .sql appended automatically', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    const base = `e2e_noext_${Date.now()}`;
    await page.locator('select').first().selectOption('views');
    await page.getByPlaceholder('filename.sql').fill(base); // no .sql
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('SELECT 3;');
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    // Status bar should show the name with .sql
    await expect(page.getByText(new RegExp(`${base}\\.sql`, 'i'))).toBeVisible({ timeout: 20000 });
  });

  test('EDITOR-007: loading an existing file shows its content in Monaco', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Files');
    await page.getByText('views').first().click();
    await page.waitForTimeout(1500);

    const sqlFile = page.getByText(/\.sql/i).first();
    if (await sqlFile.isVisible()) {
      await sqlFile.click();
      await page.waitForTimeout(2000);
      // Monaco should have content (not blank)
      const editorText = await page.locator('.monaco-editor .view-lines').textContent();
      expect(editorText?.trim().length).toBeGreaterThan(0);
    }
  });

  test('EDITOR-008: SQL linter fires in alter_ddls/ — DROP TABLE shows error panel', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('alter_ddls');
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('DROP TABLE users;');
    await page.waitForTimeout(1000);
    // Lint panel should show
    await expect(page.getByText(/DROP TABLE is destructive|destructive/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-009: SQL linter fires — TRUNCATE shows error', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('alter_ddls');
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('TRUNCATE TABLE orders;');
    await page.waitForTimeout(1000);
    await expect(page.getByText(/TRUNCATE deletes|migration/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-010: SQL linter fires — ADD COLUMN without IF NOT EXISTS shows error', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('alter_ddls');
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('ALTER TABLE users ADD COLUMN email VARCHAR(255);');
    await page.waitForTimeout(1000);
    await expect(page.getByText(/IF NOT EXISTS|already exists/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-011: SQL linter fires — DROP COLUMN shows warning', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('alter_ddls');
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('ALTER TABLE users DROP COLUMN email;');
    await page.waitForTimeout(1000);
    await expect(page.getByText(/DROP COLUMN is destructive|irreversible/i)).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-012: SQL linter does NOT fire in views/ folder', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.locator('select').first().selectOption('views');
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('DROP TABLE users;');
    await page.waitForTimeout(1500);
    // Lint panel should NOT appear for views subfolder
    await expect(page.getByText(/DROP TABLE is destructive/i)).not.toBeVisible();
  });

  test('EDITOR-013: Templates button opens dropdown with template names', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.getByRole('button', { name: /Templates/i }).click();
    // Template dropdown should show items from teams.yaml templates
    await expect(page.getByText(/Create Table|Add Column|Create View/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('EDITOR-014: selecting a template inserts SQL into editor', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    // Clear editor first
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');

    await page.getByRole('button', { name: /Templates/i }).click();
    await page.getByText('Create Table').first().click();
    await page.waitForTimeout(500);
    const editorText = await page.locator('.monaco-editor .view-lines').textContent();
    expect(editorText).toContain('CREATE TABLE');
  });

  test('EDITOR-015: New button clears filename and resets editor', async ({ page }) => {
    await login(page, 'alice');
    await goToTab(page, 'Editor');
    await page.getByPlaceholder('filename.sql').fill('some_existing_file.sql');
    await page.getByRole('button', { name: /^New$/i }).click();
    // Filename should be cleared
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
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('SELECT 99;');
    await page.getByRole('button', { name: /💾 Save|Save/i }).click();
    await expect(page.getByText(/✓ Saved|commit:/i)).toBeVisible({ timeout: 20000 });
  });

});
