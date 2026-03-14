import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { filesApi } from '../api/client'

export default function SqlEditor({ initialFile, templates, onFileSaved }) {
  const [filename, setFilename] = useState('')
  const [content, setContent] = useState('-- Write your SQL here\n')
  const [commitMessage, setCommitMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null) // {type: 'success'|'error', msg}
  const [showTemplates, setShowTemplates] = useState(false)
  const editorRef = useRef(null)

  // Load a file when initialFile changes
  useEffect(() => {
    if (!initialFile) {
      setFilename('')
      setContent('-- Write your SQL here\n')
      return
    }
    setLoading(true)
    filesApi.getFile(initialFile)
      .then(res => {
        setFilename(initialFile)
        setContent(res.data.content)
        setStatus(null)
      })
      .catch(() => setStatus({ type: 'error', msg: `Failed to load ${initialFile}` }))
      .finally(() => setLoading(false))
  }, [initialFile])

  const handleSave = async () => {
    const name = filename.trim()
    if (!name) return setStatus({ type: 'error', msg: 'Enter a filename before saving.' })
    const finalName = name.endsWith('.sql') ? name : `${name}.sql`

    setSaving(true)
    setStatus(null)
    try {
      const res = await filesApi.saveFile(finalName, content, commitMessage || undefined)
      setFilename(finalName)
      setStatus({ type: 'success', msg: `✓ Saved as ${finalName} (commit: ${res.data.commit_sha.slice(0, 7)})` })
      setCommitMessage('')
      onFileSaved?.(finalName)
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
    setContent('-- Write your SQL here\n')
    setStatus(null)
    setCommitMessage('')
  }

  // Auto-generate filename suggestion
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
          <span style={styles.folderHint}>your-team /</span>
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
            <button
              style={styles.toolBtn}
              onClick={() => setShowTemplates(v => !v)}
            >Templates ▾</button>

            {showTemplates && templates?.length > 0 && (
              <div style={styles.dropdown}>
                {templates.map(tmpl => (
                  <button
                    key={tmpl.name}
                    style={styles.dropdownItem}
                    onClick={() => insertTemplate(tmpl)}
                  >
                    <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{tmpl.name}</span>
                    <span style={{ color: '#64748b', fontSize: 11 }}>{tmpl.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            style={{ ...styles.filenameInput, maxWidth: 240, fontSize: 12, color: '#64748b' }}
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
        <div style={{ ...styles.statusBar, background: status.type === 'success' ? '#0d2d1e' : '#1a0e0e', borderColor: status.type === 'success' ? '#16a34a' : '#ef4444', color: status.type === 'success' ? '#86efac' : '#fca5a5' }}>
          {status.msg}
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
    padding: '8px 0', marginBottom: 8, flexWrap: 'wrap',
  },
  filenameWrap: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: '#161b27', border: '1px solid #1e293b',
    borderRadius: 7, padding: '6px 10px', flex: 1, maxWidth: 320,
  },
  folderHint: { fontSize: 12, color: '#475569', whiteSpace: 'nowrap' },
  filenameInput: {
    background: 'transparent', border: 'none', outline: 'none',
    color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace', flex: 1,
    minWidth: 80,
  },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  toolBtn: {
    background: '#1e293b', border: '1px solid #334155',
    borderRadius: 6, padding: '6px 12px',
    color: '#94a3b8', fontSize: 12, cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  saveBtn: {
    background: '#1d4ed8', border: 'none',
    borderRadius: 6, padding: '7px 16px',
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  statusBar: {
    padding: '8px 14px', borderRadius: 7,
    border: '1px solid', fontSize: 13, marginBottom: 8,
  },
  editorWrap: {
    flex: 1, minHeight: 0, borderRadius: 10, overflow: 'hidden',
    border: '1px solid #1e293b',
  },
  editorLoading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#475569' },
  dropdown: {
    position: 'absolute', top: '110%', left: 0, zIndex: 50,
    background: '#161b27', border: '1px solid #334155',
    borderRadius: 8, padding: 4, minWidth: 240,
    display: 'flex', flexDirection: 'column', gap: 2,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  dropdownItem: {
    background: 'none', border: 'none',
    borderRadius: 6, padding: '8px 12px',
    cursor: 'pointer', textAlign: 'left',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
}
