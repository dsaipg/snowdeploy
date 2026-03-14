import { useState, useEffect } from 'react'
import { filesApi } from '../api/client'

export default function FileBrowser({ onOpenFile, onNewFile }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
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

  const handleDelete = async (filename) => {
    setDeleting(true)
    try {
      await filesApi.deleteFile(filename)
      setDeleteConfirm(null)
      setSelected(null)
      loadFiles()
    } catch {
      setError(`Failed to delete ${filename}`)
    } finally {
      setDeleting(false)
    }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h2 style={styles.heading}>Your SQL Files</h2>
        <div style={styles.headerRight}>
          <button style={styles.refreshBtn} onClick={loadFiles}>↻ Refresh</button>
          <button style={styles.newBtn} onClick={onNewFile}>+ New File</button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.empty}>Loading files…</div>
      ) : files.length === 0 ? (
        <div style={styles.emptyBox}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <p style={{ color: '#64748b', marginBottom: 16 }}>No SQL files yet in your team folder.</p>
          <button style={styles.newBtn} onClick={onNewFile}>Create your first file</button>
        </div>
      ) : (
        <div style={styles.table}>
          {/* Header */}
          <div style={{ ...styles.row, ...styles.tableHeader }}>
            <span style={styles.colName}>Filename</span>
            <span style={styles.colMeta}>Last Modified</span>
            <span style={styles.colMeta}>Size</span>
            <span style={styles.colCommit}>Last Commit</span>
            <span style={styles.colActions} />
          </div>

          {/* Rows */}
          {files.map(file => (
            <div
              key={file.name}
              style={{ ...styles.row, ...(selected === file.name ? styles.rowSelected : {}) }}
              onClick={() => setSelected(file.name)}
            >
              <span style={styles.colName}>
                <span style={styles.fileIcon}>🗒</span>
                <span style={styles.fileName}>{file.name}</span>
              </span>
              <span style={{ ...styles.colMeta, color: '#64748b', fontSize: 12 }}>
                {formatDate(file.last_modified)}
              </span>
              <span style={{ ...styles.colMeta, color: '#64748b', fontSize: 12 }}>
                {formatSize(file.size_bytes)}
              </span>
              <span style={{ ...styles.colCommit, color: '#475569', fontSize: 12 }}>
                {file.last_commit_message
                  ? <>{file.last_commit_message.slice(0, 40)}{file.last_commit_message.length > 40 ? '…' : ''}</>
                  : <span style={{ color: '#334155' }}>—</span>
                }
              </span>
              <span style={styles.colActions} onClick={e => e.stopPropagation()}>
                <button style={styles.actionBtn} onClick={() => onOpenFile(file.name)}>Open</button>
                <button
                  style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                  onClick={() => setDeleteConfirm(file.name)}
                >Delete</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{ color: '#f1f5f9', marginBottom: 12 }}>Delete file?</h3>
            <p style={{ color: '#94a3b8', marginBottom: 20, fontSize: 14 }}>
              <strong style={{ color: '#fca5a5' }}>{deleteConfirm}</strong> will be removed and committed to Git. This cannot be undone.
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
  wrap: { maxWidth: 960, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heading: { fontSize: 18, fontWeight: 700, color: '#f1f5f9' },
  headerRight: { display: 'flex', gap: 10 },
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
    background: '#161b27', border: '1px solid #1e293b',
    borderRadius: 12,
  },
  table: { background: '#161b27', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' },
  row: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.2fr 0.7fr 2fr 160px',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #1e293b',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  tableHeader: {
    background: '#0f1117', cursor: 'default',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
    textTransform: 'uppercase', color: '#475569',
  },
  rowSelected: { background: '#172033' },
  colName: { display: 'flex', alignItems: 'center', gap: 8 },
  colMeta: { paddingRight: 12 },
  colCommit: { paddingRight: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  colActions: { display: 'flex', gap: 6, justifyContent: 'flex-end' },
  fileIcon: { fontSize: 14 },
  fileName: { fontSize: 13, fontWeight: 500, color: '#e2e8f0' },
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
    borderRadius: 12, padding: 28, maxWidth: 400, width: '100%',
  },
}
