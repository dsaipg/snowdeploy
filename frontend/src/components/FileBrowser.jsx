import { useState, useEffect } from 'react'
import { filesApi } from '../api/client'

const FOLDER_META = {
  'tables/core':    { label: 'tables / core',    icon: '🗃', color: '#60a5fa' },
  'tables/staging': { label: 'tables / staging',  icon: '📥', color: '#a78bfa' },
  'tables':         { label: 'tables',            icon: '🗃', color: '#60a5fa' },
  'views':          { label: 'views',             icon: '👁', color: '#34d399' },
  'procedures':     { label: 'procedures',        icon: '⚙',  color: '#fbbf24' },
  'migrations':     { label: 'migrations',        icon: '🔢', color: '#f87171' },
  'scripts':        { label: 'scripts',           icon: '📝', color: '#94a3b8' },
}

function folderMeta(subfolder) {
  if (!subfolder) return { label: 'root', icon: '📄', color: '#94a3b8' }
  return FOLDER_META[subfolder] || { label: subfolder, icon: '📁', color: '#94a3b8' }
}

const FOLDER_ORDER = ['tables/core', 'tables/staging', 'tables', 'views', 'procedures', 'migrations', 'scripts', '']

function groupByFolder(files) {
  const groups = {}
  for (const f of files) {
    const key = f.subfolder || ''
    if (!groups[key]) groups[key] = []
    groups[key].push(f)
  }
  return Object.entries(groups).sort(([a], [b]) => {
    const ai = FOLDER_ORDER.indexOf(a), bi = FOLDER_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export default function FileBrowser({ onOpenFile, onNewFile }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const loadFiles = () => {
    setLoading(true)
    filesApi.listFiles()
      .then(res => { setFiles(res.data.files); setError('') })
      .catch(() => setError('Failed to load files.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadFiles() }, [])

  const toggleFolder = (key) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const handleDelete = async (file) => {
    setDeleting(true)
    try {
      await filesApi.deleteFile(file.path)
      setDeleteConfirm(null)
      loadFiles()
    } catch {
      setError(`Failed to delete ${file.name}`)
    } finally {
      setDeleting(false)
    }
  }

  const groups = groupByFolder(files)

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h2 style={styles.heading}>SQL Files</h2>
        <div style={styles.headerRight}>
          <span style={styles.fileCount}>{files.length} file{files.length !== 1 ? 's' : ''}</span>
          <button style={styles.refreshBtn} onClick={loadFiles}>↻ Refresh</button>
          <button style={styles.newBtn} onClick={onNewFile}>+ New File</button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.empty}>Loading files…</div>
      ) : files.length === 0 ? (
        <div style={styles.emptyBox}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
          <p style={{ color: '#64748b', marginBottom: 16 }}>No SQL files yet in your team folder.</p>
          <button style={styles.newBtn} onClick={onNewFile}>Create your first file</button>
        </div>
      ) : (
        <div style={styles.tree}>
          {groups.map(([folderKey, folderFiles]) => {
            const meta = folderMeta(folderKey || null)
            const isCollapsed = collapsed[folderKey]
            return (
              <div key={folderKey} style={styles.folderBlock}>
                <div style={styles.folderHeader} onClick={() => toggleFolder(folderKey)}>
                  <div style={styles.folderLeft}>
                    <span style={styles.chevron}>{isCollapsed ? '▶' : '▼'}</span>
                    <span style={styles.folderIcon}>{meta.icon}</span>
                    <span style={{ ...styles.folderLabel, color: meta.color }}>{meta.label}</span>
                  </div>
                  <span style={styles.folderCount}>{folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''}</span>
                </div>

                {!isCollapsed && (
                  <div style={styles.fileList}>
                    <div style={{ ...styles.fileRow, ...styles.fileRowHeader }}>
                      <span style={styles.colName}>Filename</span>
                      <span style={styles.colMeta}>Modified</span>
                      <span style={styles.colMeta}>Size</span>
                      <span style={styles.colCommit}>Last Commit</span>
                      <span style={styles.colActions} />
                    </div>

                    {folderFiles.map(file => (
                      <div key={file.path} style={styles.fileRow}>
                        <span style={styles.colName}>
                          <span style={styles.fileIcon}>🗒</span>
                          <span style={styles.fileName}>{file.name}</span>
                        </span>
                        <span style={styles.colMeta}>{formatDate(file.last_modified)}</span>
                        <span style={styles.colMeta}>{formatSize(file.size_bytes)}</span>
                        <span style={styles.colCommit}>
                          {file.last_commit_message
                            ? file.last_commit_message.slice(0, 45) + (file.last_commit_message.length > 45 ? '…' : '')
                            : <span style={{ color: '#334155' }}>—</span>}
                        </span>
                        <span style={styles.colActions}>
                          <button style={styles.actionBtn} onClick={() => onOpenFile(file.path)}>Open</button>
                          <button
                            style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                            onClick={() => setDeleteConfirm(file)}
                          >Delete</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {deleteConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{ color: '#f1f5f9', marginBottom: 12 }}>Delete file?</h3>
            <p style={{ color: '#94a3b8', marginBottom: 20, fontSize: 14 }}>
              <strong style={{ color: '#fca5a5' }}>{deleteConfirm.path}</strong> will be removed and committed to Git. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={styles.actionBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                style={{ ...styles.actionBtn, background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444' }}
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: { maxWidth: 1000, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heading: { fontSize: 18, fontWeight: 700, color: '#f1f5f9' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  fileCount: { fontSize: 12, color: '#475569' },
  refreshBtn: {
    background: 'transparent', border: '1px solid #1e293b',
    borderRadius: 7, padding: '7px 14px',
    color: '#64748b', fontSize: 13, cursor: 'pointer',
  },
  newBtn: {
    background: '#1d4ed8', border: 'none',
    borderRadius: 7, padding: '7px 16px',
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  error: {
    background: '#450a0a', border: '1px solid #ef4444',
    borderRadius: 8, padding: '10px 14px',
    color: '#fca5a5', fontSize: 13, marginBottom: 16,
  },
  empty: { color: '#475569', textAlign: 'center', padding: '48px 0' },
  emptyBox: {
    textAlign: 'center', padding: '60px 24px',
    background: '#161b27', border: '1px solid #1e293b', borderRadius: 12,
  },
  tree: { display: 'flex', flexDirection: 'column', gap: 10 },
  folderBlock: {
    background: '#161b27', border: '1px solid #1e293b',
    borderRadius: 12, overflow: 'hidden',
  },
  folderHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', cursor: 'pointer',
    background: '#0f1117', userSelect: 'none',
  },
  folderLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  chevron: { fontSize: 10, color: '#475569', width: 10 },
  folderIcon: { fontSize: 15 },
  folderLabel: { fontSize: 13, fontWeight: 700, letterSpacing: '0.3px' },
  folderCount: { fontSize: 11, color: '#475569' },
  fileList: { display: 'flex', flexDirection: 'column' },
  fileRowHeader: {
    background: '#0a0f1a', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.8px', textTransform: 'uppercase', color: '#334155',
    cursor: 'default', borderBottom: '1px solid #1e293b',
  },
  fileRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.3fr 0.6fr 2fr 150px',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #0f1421',
  },
  colName: { display: 'flex', alignItems: 'center', gap: 8 },
  colMeta: { fontSize: 12, color: '#64748b', paddingRight: 8 },
  colCommit: { fontSize: 12, color: '#475569', paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  colActions: { display: 'flex', gap: 6, justifyContent: 'flex-end' },
  fileIcon: { fontSize: 13 },
  fileName: { fontSize: 13, fontWeight: 500, color: '#e2e8f0', fontFamily: 'monospace' },
  actionBtn: {
    background: '#1e293b', border: '1px solid #334155',
    borderRadius: 6, padding: '4px 10px',
    color: '#94a3b8', fontSize: 12, cursor: 'pointer',
  },
  deleteBtn: { background: '#1a0e0e', borderColor: '#7f1d1d', color: '#fca5a5' },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: '#161b27', border: '1px solid #334155',
    borderRadius: 12, padding: 28, maxWidth: 420, width: '100%',
  },
}
