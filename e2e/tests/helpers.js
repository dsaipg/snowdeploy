// Shared helpers for all E2E tests

const BASE = 'http://localhost:5173';
const API  = 'http://localhost:8000';

async function login(page, username = 'alice', password = 'password') {
  await page.goto(BASE);
  // Clear any stored session (page must be loaded first)
  await page.evaluate(() => {
    try {
      localStorage.removeItem('sql_portal_token');
      localStorage.removeItem('sql_portal_user');
    } catch (e) { /* ignore in blank page context */ }
  });
  await page.reload();

  // If returning-user card is shown, click "Not you?" first
  const notYou = page.getByText(/not you/i);
  if (await notYou.isVisible({ timeout: 2000 }).catch(() => false)) {
    await notYou.click();
  }

  await page.getByPlaceholder('e.g. alice').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for the main app shell (nav tabs visible = login succeeded)
  await page.getByRole('button', { name: /Files/i }).waitFor({ state: 'visible', timeout: 15000 });
}

async function clearSession(page) {
  await page.goto(BASE);
  await page.evaluate(() => {
    try {
      localStorage.removeItem('sql_portal_token');
      localStorage.removeItem('sql_portal_user');
    } catch (e) { /* ignore */ }
  });
  await page.reload();
}

async function goToTab(page, tabName) {
  await page.getByRole('button', { name: new RegExp(tabName, 'i') }).click();
  await page.waitForTimeout(500);
}

// Returns a unique filename for each test run to avoid conflicts
function uniqueFile(prefix = 'test') {
  return `${prefix}_${Date.now()}.sql`;
}

module.exports = { login, clearSession, goToTab, uniqueFile, BASE, API };
