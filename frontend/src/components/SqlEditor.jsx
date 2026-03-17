import { useState, useEffect, useRef, useMemo } from 'react'
import Editor from '@monaco-editor/react'
import { filesApi, lockApi } from '../api/client'

const SUBFOLDERS = ['schema_table_ddls/bronze', 'schema_table_ddls/silver', 'schema_table_ddls/gold', 'views', 'procedures', 'alter_ddls', 'sql_scripts']

// ── SQL linting rules (only enforced in alter_ddls/) ──────────────────────
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
  // Strip comment lines before linting
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

function parseFilePath(path) {
  if (!path) return { subfolder: '', filename: '' }
  const parts = path.split('/')
  if (parts.length === 1) return { subfolder: '', filename: path }
  return { subfolder: parts.slice(0, -1).join('/'), filename: parts[parts.length - 1] }
}

export default function SqlEditor({ initialFile, templates, onFileSaved }) {
  const [filename, setFilename] = useState('')
  const [subfolder, setSubfolder] = useState('schema_table_ddls/bronze')
  const [content, setContent] = useState('-- Write your SQL here\n')
  const [commitMessage, setCommitMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [lintDismissed, setLintDismissed] = useState(false)
  const editorRef = useRef(null)

  // Re-show lint panel whenever subfolder or content changes
  useEffect(() => { setLintDismissed(false) }, [subfolder, content])

  // Acquire lock when a file is opened, release on cleanup
  useEffect(() => {
    if (!initialFile) return
    lockApi.acquire(initialFile).catch(() => {/* non-fatal — lock warning shown in FileBrowser */})
    return () => {
      lockApi.release(initialFile).catch(() => {})
    }
  }, [initialFile])

  // Heartbeat every 5 minutes to keep lock alive
  useEffect(() => {
    if (!initialFile) return
    const interval = setInterval(() => {
      lockApi.heartbeat(initialFile).catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [initialFile])

  // Load a file when initialFile changes
  useEffect(() => {
    if (!initialFile) {
      setFilename('')
      setSubfolder('schema_table_ddls/bronze')
      setContent('-- Write your SQL here\n')
      return
    }
    const parsed = parseFilePath(initialFile)
    setLoading(true)
    filesApi.getFile(initialFile)
      .then(res => {
        setFilename(parsed.filename)
        setSubfolder(parsed.subfolder)
        setContent(res.data.content)
        // Don't clear status here — lets save success message remain visible
      })
      .catch(() => setStatus({ type: 'error', msg: `Failed to load ${initialFile}` }))
      .finally(() => setLoading(false))
  }, [initialFile])

  const lintIssues = useMemo(() => {
    if (subfolder !== 'alter_ddls') return []
    return lintSql(content)
  }, [subfolder, content])

  const hasErrors = lintIssues.some(i => i.severity === 'error')

  const handleSave = async () => {
    const name = filename.trim()
    if (!name) return setStatus({ type: 'error', msg: 'Enter a filename before saving.' })
    const finalName = name.endsWith('.sql') ? name : `${name}.sql`
    const finalSubfolder = subfolder.trim() || null

    setSaving(true)
    setStatus(null)
    try {
      const res = await filesApi.saveFile(finalName, content, commitMessage || undefined, finalSubfolder)
      setFilename(finalName)
      const displayPath = finalSubfolder ? `${finalSubfolder}/${finalName}` : finalName
      setStatus({ type: 'success', msg: `✓ Saved as ${displayPath} (commit: ${res.data.commit_sha.slice(0, 7)})` })
      setCommitMessage('')
      const savedPath = finalSubfolder ? `${finalSubfolder}/${finalName}` : finalName
      onFileSaved?.(savedPath)
    } catch (err) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Save failed.' })
    } finally {
      setSaving(false)
    }
  }

  const insertTemplate = (tmpl) => {
    if (editorRef.current) {
      const editor = editorRef.current
      const position = editor.getPosition()
      editor.executeEdits('', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        text: '\n' + tmpl.content + '\n',
      }])
      editor.focus()
    } else {
      setContent(prev => prev + '\n' + tmpl.content + '\n')
    }
    setShowTemplates(false)
  }

  const handleNew = () => {
    setFilename('')
    setSubfolder('tables/core')
    setContent('-- Write your SQL here\n')
    setStatus(null)
    setCommitMessage('')
  }

  const suggestFilename = () => {
    if (filename) return
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    setFilename(`${today}_`)
  }

  return (
    <div style={styles.wrap}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.filenameWrap}>
          <select
            style={styles.subfolderSelect}
            value={subfolder}
            onChange={e => setSubfolder(e.target.value)}
          >
            {SUBFOLDERS.map(f => <option key={f} value={f}>{f}</option>)}
            {subfolder && !SUBFOLDERS.includes(subfolder) && (
              <option value={subfolder}>{subfolder}</option>
            )}
            <option value="">/ (root)</option>
          </select>
          <span style={styles.folderHint}>/</span>
          <input
            style={styles.filenameInput}
            value={filename}
            onChange={e => setFilename(e.target.value)}
            onFocus={suggestFilename}
            placeholder="filename.sql"
            spellCheck={false}
          />
        </div>

        <div style={styles.toolbarActions}>
          <button style={styles.toolBtn} onClick={handleNew}>New</button>

          <div style={{ position: 'relative' }}>
            <button style={styles.toolBtn} onClick={() => setShowTemplates(v => !v)}>
              Templates ▾
            </button>
            {showTemplates && templates?.length > 0 && (
              <div style={styles.dropdown}>
                {templates.map(tmpl => (
                  <button key={tmpl.name} style={styles.dropdownItem} onClick={() => insertTemplate(tmpl)}>
                    <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{tmpl.name}</span>
                    <span style={{ color: '#9899b8', fontSize: 11 }}>{tmpl.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            style={{ ...styles.filenameInput, maxWidth: 240, fontSize: 12, color: '#9899b8', background: '#1a1b26', border: '1px solid #2a2d3e', borderRadius: 6, padding: '6px 10px' }}
            value={commitMessage}
            onChange={e => setCommitMessage(e.target.value)}
            placeholder="Commit message (optional)"
          />

          <button
            style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>

      {/* Status bar */}
      {status && (
        <div style={{
          ...styles.statusBar,
          background: status.type === 'success' ? '#0d2d1e' : '#1a0e0e',
          borderColor: status.type === 'success' ? '#16a34a' : '#ef4444',
          color: status.type === 'success' ? '#86efac' : '#fca5a5',
        }}>
          {status.msg}
        </div>
      )}

      {/* ── Lint panel (alter_ddls/ only) ── */}
      {lintIssues.length > 0 && !lintDismissed && (
        <div style={{ ...styles.lintPanel, borderColor: hasErrors ? '#ef4444' : '#f59e0b' }}>
          <div style={styles.lintHeader}>
            <span style={{ ...styles.lintTitle, color: hasErrors ? '#fca5a5' : '#fcd34d' }}>
              {hasErrors ? '🚫' : '⚠️'} Migration lint — {lintIssues.length} issue{lintIssues.length > 1 ? 's' : ''} found
            </span>
            <button style={styles.lintDismiss} onClick={() => setLintDismissed(true)}>✕</button>
          </div>
          <div style={styles.lintList}>
            {lintIssues.map(issue => (
              <div key={issue.id} style={styles.lintItem}>
                <span style={{
                  ...styles.lintBadge,
                  background: issue.severity === 'error' ? '#450a0a' : '#1c1408',
                  color: issue.severity === 'error' ? '#fca5a5' : '#fcd34d',
                  borderColor: issue.severity === 'error' ? '#7f1d1d' : '#92400e',
                }}>
                  {issue.severity}
                </span>
                <div style={styles.lintText}>
                  <span style={{ color: '#e2e8f0', fontSize: 13 }}>{issue.message}</span>
                  <span style={{ color: '#9899b8', fontSize: 11 }}>→ {issue.fix}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      <div style={styles.editorWrap}>
        {loading ? (
          <div style={styles.editorLoading}>Loading file…</div>
        ) : (
          <Editor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={content}
            onChange={val => setContent(val ?? '')}
            onMount={editor => { editorRef.current = editor }}
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
              minimap: { enabled: false },
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              tabSize: 4,
              renderWhitespace: 'selection',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              padding: { top: 16, bottom: 16 },
              suggest: { showKeywords: true },
            }}
          />
        )}
      </div>
    </div>
  )
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 0', marginBottom: 8, flexWrap: 'wrap', flexShrink: 0,
  },
  filenameWrap: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: '#1a1b26', border: '1px solid #2a2d3e',
    borderRadius: 7, padding: '6px 10px', flex: 1, maxWidth: 320,
  },
  subfolderSelect: {
    background: '#252836', border: '1px solid #3d4060',
    borderRadius: 5, outline: 'none', padding: '3px 6px',
    color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
    maxWidth: 160,
  },
  folderHint: { fontSize: 12, color: '#5c5f7a', whiteSpace: 'nowrap' },
  filenameInput: {
    background: 'transparent', border: 'none', outline: 'none',
    color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace', flex: 1, minWidth: 80,
  },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  toolBtn: {
    background: '#2a2d3e', border: '1px solid #334155',
    borderRadius: 6, padding: '6px 12px',
    color: '#94a3b8', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  saveBtn: {
    background: '#4f46e5', border: 'none', borderRadius: 6, padding: '7px 16px',
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  statusBar: {
    padding: '8px 14px', borderRadius: 7, border: '1px solid',
    fontSize: 13, marginBottom: 8, flexShrink: 0,
  },

  // Lint panel
  lintPanel: {
    border: '1px solid', borderRadius: 8,
    marginBottom: 8, overflow: 'hidden', flexShrink: 0,
    background: '#13141c',
  },
  lintHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 14px', borderBottom: '1px solid #2a2d3e',
  },
  lintTitle: { fontSize: 13, fontWeight: 600 },
  lintDismiss: {
    background: 'none', border: 'none', color: '#5c5f7a',
    cursor: 'pointer', fontSize: 14, padding: '0 4px',
  },
  lintList: { display: 'flex', flexDirection: 'column', gap: 0 },
  lintItem: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '8px 14px', borderBottom: '1px solid #2a2d3e',
  },
  lintBadge: {
    fontSize: 10, fontWeight: 700, border: '1px solid',
    borderRadius: 4, padding: '2px 6px', flexShrink: 0,
    textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 1,
  },
  lintText: { display: 'flex', flexDirection: 'column', gap: 2 },

  editorWrap: {
    flex: 1, minHeight: 0, borderRadius: 10, overflow: 'hidden',
    border: '1px solid #2a2d3e',
  },
  editorLoading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100%', color: '#5c5f7a',
  },
  dropdown: {
    position: 'absolute', top: '110%', left: 0, zIndex: 50,
    background: '#1a1b26', border: '1px solid #334155',
    borderRadius: 8, padding: 4, minWidth: 240,
    display: 'flex', flexDirection: 'column', gap: 2,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  dropdownItem: {
    background: 'none', border: 'none', borderRadius: 6, padding: '8px 12px',
    cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
  },
}
