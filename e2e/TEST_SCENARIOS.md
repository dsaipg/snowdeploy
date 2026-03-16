# E2E Test Scenarios — SQL Deployment Portal

**Last run:** 2026-03-15
**Result: 46 passed / 19 failed / 65 total**
**Tool:** Playwright (Chromium headless)
**Stack:** React frontend (localhost:5173) + FastAPI backend (localhost:8000) — full Docker stack

---

## Summary Table

| Tab | Total | Passed | Failed |
|---|---|---|---|
| AUTH — Login & Session | 13 | 9 | 4 |
| EDITOR — SQL editor & save | 17 | 9 | 8 |
| FILES — File browser | 11 | 8 | 3 |
| HISTORY — Deployment history | 7 | 6 | 1 |
| PROMOTE — Promotion pipeline | 20 | 14 | 6 |
| **TOTAL** | **68** | **46** | **19** |

---

## AUTH — Login & Session

| ID | Scenario | Result | Notes |
|---|---|---|---|
| AUTH-001 | Fresh login form shown when no session exists | ✅ PASS | |
| AUTH-002 | Alice logs in successfully — app shell visible | ✅ PASS | |
| AUTH-003 | Bob logs in successfully — app shell visible | ✅ PASS | |
| AUTH-004 | Rita logs in successfully — app shell visible | ✅ PASS | |
| AUTH-005 | Wrong password shows error message | ❌ FAIL | Error text not matching selector `/invalid\|incorrect\|failed/i`; actual text is "Login failed. Please try again." — selector needs update |
| AUTH-006 | Unknown username shows error message | ❌ FAIL | Same as AUTH-005 |
| AUTH-007 | Empty fields — HTML required prevents submit | ✅ PASS | |
| AUTH-008 | Returning user card shown on second visit | ❌ FAIL | Page navigated to `/login` which doesn't exist as a route; returning user card uses localStorage read on mount — need to stay at BASE and reload |
| AUTH-009 | "Not you?" clears session and shows full form | ❌ FAIL | Timeout — depends on AUTH-008 flow working |
| AUTH-010 | After login, team badge shows correct team name | ✅ PASS | |
| AUTH-011 | Rita sees Team Beta in header | ✅ PASS | |
| AUTH-012 | Sign out clears session and shows login form | ✅ PASS | |
| AUTH-013 | One-click returning user sign-in without credentials | ❌ FAIL | Same root cause as AUTH-008 |

**Root cause for AUTH failures:**
- AUTH-005/006: Error message text is `"Login failed. Please try again."` — regex `/invalid\|incorrect\|failed/i` should match `failed` but the clearSession reload timing causes the page to show the login form before the axios call completes, so the error div isn't there. Fix: wait for axios response before asserting.
- AUTH-008/009/013: The returning user flow works on `page.goto(BASE)` not `page.goto(BASE + '/login')` (there's no `/login` route — it's a SPA). The test navigates to a 404-like URL. Fix: reload BASE instead.

---

## EDITOR — SQL Editor & Save

| ID | Scenario | Result | Notes |
|---|---|---|---|
| EDITOR-001 | Editor tab shows subfolder select, filename, Save button | ✅ PASS | |
| EDITOR-002 | Subfolder dropdown contains all expected folders | ✅ PASS | |
| EDITOR-003 | Create and save a new SQL file in views/ | ❌ FAIL | Monaco editor click + `Control+a` doesn't select all — Monaco captures keyboard differently. Fix: use `editorRef` or click line then triple-click |
| EDITOR-004 | Save shows commit SHA in status bar | ❌ FAIL | Same Monaco input issue |
| EDITOR-005 | Save with empty filename shows error | ❌ FAIL | Error status bar text is `"Enter a filename before saving."` — test checks for it but timing issue: status bar appears briefly then hides; need `waitFor` with longer timeout |
| EDITOR-006 | Filename without .sql gets .sql appended | ❌ FAIL | Same Monaco input issue blocking save |
| EDITOR-007 | Loading an existing file shows content in Monaco | ❌ FAIL | Clicking `.sql` text in file list doesn't trigger the file open handler — need to click the row/button not the text span |
| EDITOR-008 | SQL linter fires in alter_ddls/ — DROP TABLE | ✅ PASS | |
| EDITOR-009 | SQL linter fires — TRUNCATE shows error | ❌ FAIL | Monaco `Control+a` + type doesn't clear previous content; linter sees old text without TRUNCATE. Fix: use `page.fill()` or clear differently |
| EDITOR-010 | SQL linter fires — ADD COLUMN without IF NOT EXISTS | ❌ FAIL | Same Monaco clear issue — previous DROP TABLE content remains |
| EDITOR-011 | SQL linter fires — DROP COLUMN shows warning | ✅ PASS | Runs right after fresh login, editor is empty so ADD COLUMN is the only content |
| EDITOR-012 | SQL linter does NOT fire in views/ folder | ✅ PASS | |
| EDITOR-013 | Templates button opens dropdown | ✅ PASS | |
| EDITOR-014 | Selecting a template inserts SQL into editor | ❌ FAIL | Template inserts via Monaco `executeEdits` — reading `.view-lines` textContent is timing-sensitive (Monaco renders async). Fix: add `waitForTimeout` after click |
| EDITOR-015 | New button clears filename | ✅ PASS | |
| EDITOR-016 | Commit message field is present | ✅ PASS | |
| EDITOR-017 | Save with custom commit message | ❌ FAIL | Monaco input issue (same as EDITOR-003) |

**Root causes for EDITOR failures:**
1. **Monaco keyboard input** — `page.keyboard.press('Control+a')` inside Monaco doesn't reliably select all. Monaco is an iframe-like canvas widget. Fix: use `page.locator('.monaco-editor textarea').fill()` which targets Monaco's hidden textarea directly, or triple-click the editor.
2. **Sequential test state bleed** — tests run in order; Monaco content from test N carries over to test N+1. Fix: use `page.locator('.monaco-editor textarea').fill('')` to reset.
3. **Lint panel timing** — linter runs in `useMemo` which is synchronous, but Monaco content change events are async. Fix: add `waitForTimeout(500)` after typing.

---

## FILES — File Browser

| ID | Scenario | Result | Notes |
|---|---|---|---|
| FILES-001 | Files tab is the default after login | ✅ PASS | |
| FILES-002 | Folder tree shows all top-level folders | ❌ FAIL | `getByText('schema_table_ddls')` matches partial text in commit messages too; the folder tree renders folder names in a specific component. Fix: scope to the left pane container |
| FILES-003 | schema_table_ddls expands to show bronze/silver/gold | ❌ FAIL | Same selector ambiguity; also tree may already be expanded by default |
| FILES-004 | Clicking views folder shows .sql files | ✅ PASS | |
| FILES-005 | File list shows last commit author | ✅ PASS | |
| FILES-006 | New File button navigates to Editor | ✅ PASS | |
| FILES-007 | Alice team isolation — no team-b content | ✅ PASS | |
| FILES-008 | Rita sees team-b files only | ✅ PASS | |
| FILES-009 | Clicking a SQL file opens Editor with content | ❌ FAIL | Clicking `getByText(/\.sql/i)` targets the file extension badge not the clickable row. Fix: click the parent row/button element |
| FILES-010 | Lock badge visible when another user has file open | ✅ PASS | |
| FILES-011 | Empty folder shows graceful empty state | ✅ PASS | |

**Root causes for FILES failures:**
1. **FILES-002/003**: `getByText('schema_table_ddls')` is too broad — matches text in file paths and commit messages in the right pane. Fix: scope selector to the folder tree container (left panel).
2. **FILES-009**: Clicking the `.sql` text content clicks the extension label. The clickable element is the containing row. Fix: click `locator('[data-filename]')` or the button/div wrapping each file row.

---

## HISTORY — Deployment History

| ID | Scenario | Result | Notes |
|---|---|---|---|
| HISTORY-001 | History tab is visible after login | ❌ FAIL | `getByRole('tab', { name: /history/i })` — tabs are `<button>` not ARIA role=tab. Test was updated but old selector still used. Fix: use `getByRole('button', { name: /History/i })` |
| HISTORY-002 | History tab shows deployment records | ✅ PASS | |
| HISTORY-003 | History record shows environment info | ✅ PASS | |
| HISTORY-004 | History record shows Airflow run status | ✅ PASS | |
| HISTORY-005 | Alice only sees team deployments | ✅ PASS | |
| HISTORY-006 | Empty history — graceful empty state | ✅ PASS | |
| HISTORY-007 | Refresh does not duplicate entries | ✅ PASS | |

**Root cause for HISTORY-001:**
`getByRole('tab')` — the tabs are rendered as `<button>` elements, not with ARIA role="tab". Test was using old selector pattern. Fix: `getByRole('button', { name: /📋 History/i })`.

---

## PROMOTE — Promotion Pipeline

| ID | Scenario | Result | Notes |
|---|---|---|---|
| PROMOTE-001 | Promote tab visible after login | ✅ PASS | |
| PROMOTE-002 | QA and Prod environment toggle buttons visible | ✅ PASS | |
| PROMOTE-003 | File list shows SQL files with checkboxes | ✅ PASS | |
| PROMOTE-004 | Select All selects all files | ✅ PASS | |
| PROMOTE-005 | None button deselects all | ✅ PASS | |
| PROMOTE-006 | Submit button disabled with no files selected | ✅ PASS | |
| PROMOTE-007 | Submit one file creates open promotion request | ✅ PASS | |
| PROMOTE-008 | Submitter sees "Waiting for a teammate" not Approve | ✅ PASS | |
| PROMOTE-009 | Bob sees Approve button on alice's submission | ❌ FAIL | Bob's browser context doesn't see Alice's just-submitted request — polling interval is 15s but test only waits 3s. Also PROMOTION_MODE=github causes real PR creation which may fail if develop and qa are at same commit. Fix: wait longer or mock the API |
| PROMOTE-010 | Mock mode — request auto-approves within 40s | ❌ FAIL | PROMOTION_MODE is "github" in running stack, not "mock" — auto-approval never fires. Test assumes mock mode. Fix: test against mock stack, or test both modes separately |
| PROMOTE-011 | After approval, Deploy button appears | ❌ FAIL | Same as PROMOTE-010 — no auto-approval in github mode |
| PROMOTE-012 | Deploy button triggers deployment | ❌ FAIL | Depends on approval — same root cause |
| PROMOTE-013 | Notes field accepts deployment notes | ✅ PASS | |
| PROMOTE-014 | Schedule toggle NOT visible for views/ files | ✅ PASS | |
| PROMOTE-015 | Schedule toggle visible for procedures/ files | ✅ PASS | |
| PROMOTE-016 | Schedule toggle visible for sql_scripts/ files | ✅ PASS | |
| PROMOTE-017 | Enable schedule reveals hourly/daily/weekly/custom | ✅ PASS | |
| PROMOTE-018 | PR URL link on github mode submissions | ✅ PASS | |
| PROMOTE-019 | Switching QA↔Prod updates submit button label | ✅ PASS | |
| PROMOTE-020 | Active Reviews section visible | ✅ PASS | |

**Root causes for PROMOTE failures:**
1. **PROMOTE-009**: Cross-browser context timing — the test submits then immediately opens Bob's browser. The backend hasn't processed the submission yet (GitHub PR creation takes 2-5s). Fix: wait 10s after submit before opening Bob's context.
2. **PROMOTE-010/011/012**: The running stack uses `PROMOTION_MODE=github`, not `mock`. Auto-approval only works in mock mode. These tests need either: (a) the stack running in mock mode, or (b) a separate bob-approves flow instead of waiting for auto-approval. Real fix: parameterise tests by mode, or use bob to manually approve in the github-mode tests.

---

## Failing Tests — Fix Priority

| Priority | Test(s) | Fix Needed | Effort |
|---|---|---|---|
| High | EDITOR-003/004/006/017 | Monaco textarea input — use `page.locator('.monaco-editor textarea').fill(sql)` | Small |
| High | EDITOR-009/010 | Clear Monaco between tests using textarea fill | Small |
| High | PROMOTE-010/011/012 | Tests assume mock mode — run separate test suite against mock stack | Small |
| Medium | AUTH-005/006 | Match actual error text `"Login failed"` — update regex | Trivial |
| Medium | AUTH-008/009/013 | Navigate to `BASE` not `BASE + '/login'` for returning-user flow | Trivial |
| Medium | FILES-002/003 | Scope folder tree selectors to left pane container | Small |
| Medium | FILES-009 | Click file row element, not text label | Small |
| Medium | PROMOTE-009 | Wait 10s after submit before opening Bob's context | Trivial |
| Low | HISTORY-001 | Change `getByRole('tab')` to `getByRole('button')` | Trivial |
| Low | EDITOR-014 | Add `waitForTimeout(500)` after template insert | Trivial |

---

## How to Run

```bash
cd e2e
npm test                    # run all tests headless
npx playwright test --headed  # run with visible browser (useful for debugging)
npx playwright test auth.spec.js  # run one spec file
npx playwright test --grep "AUTH-002"  # run one specific test
npm run report              # open HTML report
```

## Notes

- Tests run **serially** (1 worker) because they share backend state (promotions, git, locks)
- Each test logs in fresh and clears localStorage to avoid session bleed
- Tests that create promotions or files leave state behind — a cleanup step between test runs would improve reliability
- The `PROMOTION_MODE=github` setting means PROMOTE-010/011/012 cannot pass without stack reconfiguration to mock mode
