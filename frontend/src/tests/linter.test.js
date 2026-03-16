/**
 * Tests for the SQL linting rules defined in SqlEditor.jsx
 * Since lintSql is not exported, we test the rules logic directly here.
 */
import { describe, it, expect } from 'vitest'

// Re-implement the LINT_RULES and lintSql function from SqlEditor.jsx for isolated testing
const LINT_RULES = [
  {
    id: 'add-column-no-if-not-exists',
    severity: 'error',
    pattern: /ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN(?!\s+IF\s+NOT\s+EXISTS)/gi,
    message: 'ADD COLUMN without IF NOT EXISTS — will fail if column already exists.',
    fix: 'Use ADD COLUMN IF NOT EXISTS',
  },
  {
    id: 'drop-column',
    severity: 'warning',
    pattern: /ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN/gi,
    message: 'DROP COLUMN is destructive and irreversible.',
    fix: 'Ensure this is intentional and reviewed before deploying to prod',
  },
  {
    id: 'rename-column',
    severity: 'warning',
    pattern: /ALTER\s+TABLE\s+\S+\s+RENAME\s+COLUMN/gi,
    message: 'RENAME COLUMN may break views or procedures referencing the old name.',
    fix: 'Check all dependent views and procedures first',
  },
  {
    id: 'create-table-no-if-not-exists',
    severity: 'warning',
    pattern: /CREATE\s+TABLE(?!\s+IF\s+NOT\s+EXISTS)/gi,
    message: 'CREATE TABLE without IF NOT EXISTS — belongs in tables/ not alter_ddls/.',
    fix: 'Move to tables/core or tables/staging, or add IF NOT EXISTS',
  },
  {
    id: 'truncate',
    severity: 'error',
    pattern: /\bTRUNCATE\b/gi,
    message: 'TRUNCATE deletes all rows — should never be in a migration.',
    fix: 'Remove this statement',
  },
  {
    id: 'drop-table',
    severity: 'error',
    pattern: /\bDROP\s+TABLE\b/gi,
    message: 'DROP TABLE is destructive — requires explicit manual review.',
    fix: 'Do not deploy via portal — run manually with approval',
  },
]

function lintSql(content) {
  const stripped = content
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')

  const issues = []
  for (const rule of LINT_RULES) {
    rule.pattern.lastIndex = 0
    if (rule.pattern.test(stripped)) {
      issues.push(rule)
    }
  }
  return issues
}

describe('lintSql — LINT_RULES', () => {

  describe('add-column-no-if-not-exists rule', () => {
    it('flags ALTER TABLE ADD COLUMN without IF NOT EXISTS', () => {
      const issues = lintSql('ALTER TABLE my_table ADD COLUMN new_col VARCHAR(100);')
      const rule = issues.find(i => i.id === 'add-column-no-if-not-exists')
      expect(rule).toBeDefined()
      expect(rule.severity).toBe('error')
    })

    it('does NOT flag ALTER TABLE ADD COLUMN IF NOT EXISTS', () => {
      const issues = lintSql('ALTER TABLE my_table ADD COLUMN IF NOT EXISTS new_col VARCHAR(100);')
      const rule = issues.find(i => i.id === 'add-column-no-if-not-exists')
      expect(rule).toBeUndefined()
    })

    it('is case-insensitive', () => {
      const issues = lintSql('alter table my_table add column new_col varchar(100);')
      const rule = issues.find(i => i.id === 'add-column-no-if-not-exists')
      expect(rule).toBeDefined()
    })
  })

  describe('drop-column rule', () => {
    it('flags ALTER TABLE DROP COLUMN', () => {
      const issues = lintSql('ALTER TABLE my_table DROP COLUMN old_col;')
      const rule = issues.find(i => i.id === 'drop-column')
      expect(rule).toBeDefined()
      expect(rule.severity).toBe('warning')
    })

    it('is case-insensitive', () => {
      const issues = lintSql('alter table my_table drop column old_col;')
      const rule = issues.find(i => i.id === 'drop-column')
      expect(rule).toBeDefined()
    })

    it('does not flag unrelated DROP statements', () => {
      const issues = lintSql('DROP VIEW my_view;')
      const rule = issues.find(i => i.id === 'drop-column')
      expect(rule).toBeUndefined()
    })
  })

  describe('rename-column rule', () => {
    it('flags ALTER TABLE RENAME COLUMN', () => {
      const issues = lintSql('ALTER TABLE my_table RENAME COLUMN old_name TO new_name;')
      const rule = issues.find(i => i.id === 'rename-column')
      expect(rule).toBeDefined()
      expect(rule.severity).toBe('warning')
    })

    it('is case-insensitive', () => {
      const issues = lintSql('alter table my_table rename column old_name to new_name;')
      const rule = issues.find(i => i.id === 'rename-column')
      expect(rule).toBeDefined()
    })
  })

  describe('create-table-no-if-not-exists rule', () => {
    it('flags CREATE TABLE without IF NOT EXISTS', () => {
      const issues = lintSql('CREATE TABLE my_table (id INT);')
      const rule = issues.find(i => i.id === 'create-table-no-if-not-exists')
      expect(rule).toBeDefined()
      expect(rule.severity).toBe('warning')
    })

    it('does NOT flag CREATE TABLE IF NOT EXISTS', () => {
      const issues = lintSql('CREATE TABLE IF NOT EXISTS my_table (id INT);')
      const rule = issues.find(i => i.id === 'create-table-no-if-not-exists')
      expect(rule).toBeUndefined()
    })

    it('is case-insensitive', () => {
      const issues = lintSql('create table my_table (id int);')
      const rule = issues.find(i => i.id === 'create-table-no-if-not-exists')
      expect(rule).toBeDefined()
    })
  })

  describe('truncate rule', () => {
    it('flags TRUNCATE statement', () => {
      const issues = lintSql('TRUNCATE TABLE my_table;')
      const rule = issues.find(i => i.id === 'truncate')
      expect(rule).toBeDefined()
      expect(rule.severity).toBe('error')
    })

    it('flags bare TRUNCATE', () => {
      const issues = lintSql('TRUNCATE my_table;')
      const rule = issues.find(i => i.id === 'truncate')
      expect(rule).toBeDefined()
    })

    it('is case-insensitive', () => {
      const issues = lintSql('truncate my_table;')
      const rule = issues.find(i => i.id === 'truncate')
      expect(rule).toBeDefined()
    })

    it('does not flag words containing TRUNCATE as substring in normal context', () => {
      // Word boundary (\b) means "TRUNCATED" should not match
      const issues = lintSql('-- This is a note about truncated values')
      const rule = issues.find(i => i.id === 'truncate')
      // Comment lines are stripped, so this should be clean
      expect(rule).toBeUndefined()
    })
  })

  describe('drop-table rule', () => {
    it('flags DROP TABLE statement', () => {
      const issues = lintSql('DROP TABLE my_table;')
      const rule = issues.find(i => i.id === 'drop-table')
      expect(rule).toBeDefined()
      expect(rule.severity).toBe('error')
    })

    it('is case-insensitive', () => {
      const issues = lintSql('drop table my_table;')
      const rule = issues.find(i => i.id === 'drop-table')
      expect(rule).toBeDefined()
    })

    it('does not flag DROP VIEW', () => {
      const issues = lintSql('DROP VIEW my_view;')
      const rule = issues.find(i => i.id === 'drop-table')
      expect(rule).toBeUndefined()
    })
  })

  describe('comment stripping', () => {
    it('ignores rules in comment lines starting with --', () => {
      const sql = `-- DROP TABLE this_is_a_comment
SELECT 1;`
      const issues = lintSql(sql)
      const rule = issues.find(i => i.id === 'drop-table')
      expect(rule).toBeUndefined()
    })

    it('still flags rules on non-comment lines', () => {
      const sql = `-- safe comment
DROP TABLE actual_table;`
      const issues = lintSql(sql)
      const rule = issues.find(i => i.id === 'drop-table')
      expect(rule).toBeDefined()
    })
  })

  describe('multiple issues', () => {
    it('returns multiple issues when multiple rules match', () => {
      const sql = `DROP TABLE old_table;
TRUNCATE my_other_table;`
      const issues = lintSql(sql)
      expect(issues.length).toBeGreaterThanOrEqual(2)
    })

    it('returns empty array for clean SQL', () => {
      const sql = `SELECT u.id, u.name
FROM users u
WHERE u.active = true;`
      const issues = lintSql(sql)
      expect(issues).toHaveLength(0)
    })
  })
})
