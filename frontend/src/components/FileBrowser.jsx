import { useState, useEffect } from 'react'
import { filesApi, lockApi } from '../api/client'

const FOLDER_META = {
  'schema_table_ddls/bronze': { label: 'bronze', icon: '◈', color: '#cd7f32', indent: true },
  'schema_table_ddls/silver': { label: 'silver', icon: '◈', color: '#a8a9ad', indent: true },
  'schema_table_ddls/gold':   { label: 'gold',   icon: '◈', color: '#fbbf24', indent: true },
  'views':       { label: 'views',      icon: '▤', color: '#34d399', indent: false },
  'procedures':  { label: 'procedures', icon: 'ƒ', color: '#f87171', indent: false },
  'alter_ddls':  { label: 'alter_ddls', icon: '🔧', color: '#818cf8', indent: false },
  'sql_scripts': { label: 'sql_scripts', icon: '≡', color: '#94a3b8', indent: false },
}

// Always show these folders, even if empty
const ALL_FOLDERS = [
  { key: 'schema_table_ddls/bronze', header: null },
  { key: 'schema_table_ddls/silver', header: null },
  { key: 'schema_table_ddls/gold',   header: null },
  { key: 'views',             header: null },
  { key: 'procedures',        header: null },
  { key: 'alter_ddls',        header: null },
  { key: 'sql_scripts',           header: null },
]

const FOLDER_ORDER = ALL_FOLDERS.map(f => f.key)


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
  const [locks, setLocks] = useState({})   // path → lock object
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [search, setSearch] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [lockWarning, setLockWarning] = useState(null)  // file being opened while locked

  const loadFiles = () => {
    setLoading(true)
    Promise.all([filesApi.listFiles(), lockApi.list()])
      .then(([filesRes, locksRes]) => {
        setFiles(filesRes.data.files)
        const lockMap = {}
        for (const lock of (locksRes.data || [])) {
          lockMap[lock.file_path] = lock
        }
        setLocks(lockMap)
        setError('')
        if (!selectedFolder) setSelectedFolder(ALL_FOLDERS[0].key)
      })
      .catch(() => setError('Failed to load files.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadFiles()
    const interval = setInterval(loadFiles, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleOpenFile = (file) => {
    const lock = locks[file.path]
    if (lock) {
      setLockWarning({ file, lock })
    } else {
      onOpenFile(file.path)
    }
  }

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

  const filesByFolder = {}
  for (const f of files) {
    const key = f.subfolder || ''
    if (!filesByFolder[key]) filesByFolder[key] = []
    filesByFolder[key].push(f)
  }

  const visibleFiles = filesByFolder[selectedFolder] ?? []
  const filteredFiles = search.trim()
    ? visibleFiles.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : visibleFiles

  const meta = FOLDER_META[selectedFolder] || { label: selectedFolder || 'root', icon: '📁', color: '#9899b8' }

  return (
    <div style={styles.shell}>
      {/* ── Top bar ── */}
      <div style={styles.topBar}>
        <h2 style={styles.heading}>SQL Files</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={styles.totalCount}>{files.length} total files</span>
          <button style={styles.refreshBtn} onClick={loadFiles}>↻</button>
          <button style={styles.newBtn} onClick={onNewFile}>+ New File</button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : files.length === 0 ? (
        <div style={styles.emptyBox}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
          <p style={{ color: '#9899b8', marginBottom: 16 }}>No SQL files yet.</p>
          <button style={styles.newBtn} onClick={onNewFile}>Create your first file</button>
        </div>
      ) : (
        <div style={styles.panes}>
          {/* ── Left: folder tree ── */}
          <div style={styles.sidebar}>
            <div style={styles.sidebarLabel}>FOLDERS</div>

            {/* schema_table_ddls group header */}
            <div style={styles.groupHeader}>
              <span style={{ fontSize: 13 }}>🗃</span>
              <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>schema_table_ddls</span>
            </div>

            {ALL_FOLDERS.map(({ key }) => {
              const m = FOLDER_META[key]
              const active = selectedFolder === key
              const count = (filesByFolder[key] || []).length
              return (
                <div
                  key={key}
                  style={{
                    ...styles.folderRow,
                    ...(active ? styles.folderRowActive : {}),
                    paddingLeft: m.indent ? 28 : 12,
                    ...(m.indent ? {} : { marginTop: 2 }),
                  }}
                  onClick={() => { setSelectedFolder(key); setSearch('') }}
                >
                  <span style={styles.folderIcon}>{m.icon}</span>
                  <span style={{ ...styles.folderLabel, color: active ? '#f1f5f9' : m.color }}>
                    {m.label}
                  </span>
                  {count > 0 && <span style={styles.folderBadge}>{count}</span>}
                </div>
              )
            })}
          </div>

          {/* ── Right: file list ── */}
          <div style={styles.filePane}>
            {/* File pane header */}
            <div style={styles.filePaneHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <span style={{ ...styles.filePaneTitle, color: meta.color }}>{meta.label}</span>
                <span style={styles.fileCountBadge}>{filteredFiles.length}</span>
              </div>
              <input
                style={styles.searchInput}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter files…"
              />
            </div>

            {/* Column headers */}
            <div style={{ ...styles.fileRow, ...styles.fileRowHeader }}>
              <span style={styles.colName}>Filename</span>
              <span style={styles.colMeta}>Modified</span>
              <span style={styles.colMeta}>Size</span>
              <span style={styles.colCommit}>Last Commit</span>
              <span style={styles.colActions} />
            </div>

            {/* Files */}
            <div style={styles.fileScroll}>
              {filteredFiles.length === 0 ? (
                <div style={styles.emptyFolder}>
                  {search ? `No files matching "${search}"` : 'No files in this folder'}
                </div>
              ) : filteredFiles.map(file => {
                const lock = locks[file.path]
                return (
                  <div key={file.path} style={styles.fileRow}>
                    <span style={styles.colName}>
                      <span style={{ fontSize: 13 }}>{lock ? '🔒' : '🗒'}</span>
                      <span style={styles.fileName}>{file.name}</span>
                      {lock && <span style={styles.lockBadge}>{lock.display_name}</span>}
                    </span>
                    <span style={styles.colMeta}>{formatDate(file.last_modified)}</span>
                    <span style={styles.colMeta}>{formatSize(file.size_bytes)}</span>
                    <span style={styles.colCommit}>
                      {file.last_commit_message
                        ? file.last_commit_message.slice(0, 50) + (file.last_commit_message.length > 50 ? '…' : '')
                        : <span style={{ color: '#4a4d66' }}>—</span>}
                    </span>
                    <span style={styles.colActions}>
                      <button style={styles.actionBtn} onClick={() => handleOpenFile(file)}>Open</button>
                      <button
                        style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                        onClick={() => setDeleteConfirm(file)}
                      >Delete</button>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Lock warning modal */}
      {lockWarning && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{ color: '#f1f5f9', marginBottom: 12 }}>File is being edited</h3>
            <p style={{ color: '#94a3b8', marginBottom: 8, fontSize: 14 }}>
              <strong style={{ color: '#fcd34d' }}>{lockWarning.lock.display_name}</strong> is currently editing{' '}
              <strong style={{ color: '#e2e8f0' }}>{lockWarning.file.name}</strong>.
            </p>
            <p style={{ color: '#9899b8', marginBottom: 20, fontSize: 13 }}>
              You can still open it, but your changes may conflict with theirs.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={styles.actionBtn} onClick={() => setLockWarning(null)}>Cancel</button>
              <button
                style={{ ...styles.actionBtn, background: '#2d2a6e', borderColor: '#6366f1', color: '#93c5fd' }}
                onClick={() => { onOpenFile(lockWarning.file.path); setLockWarning(null) }}
              >Open anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{ color: '#f1f5f9', marginBottom: 12 }}>Delete file?</h3>
            <p style={{ color: '#94a3b8', marginBottom: 20, fontSize: 14 }}>
              <strong style={{ color: '#fca5a5' }}>{deleteConfirm.path}</strong> will be removed and committed to Git.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={styles.actionBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                style={{ ...styles.actionBtn, background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444' }}
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
              >{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  shell: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  topBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12, flexShrink: 0,
  },
  heading: { fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  totalCount: { fontSize: 12, color: '#5c5f7a' },
  refreshBtn: {
    background: 'transparent', border: '1px solid #2a2d3e',
    borderRadius: 6, padding: '6px 10px',
    color: '#9899b8', fontSize: 14, cursor: 'pointer',
  },
  newBtn: {
    background: '#4f46e5', border: 'none', borderRadius: 7,
    padding: '7px 16px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  error: {
    background: '#450a0a', border: '1px solid #ef4444', borderRadius: 8,
    padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 12, flexShrink: 0,
  },
  empty: { color: '#5c5f7a', textAlign: 'center', padding: '48px 0' },
  emptyBox: {
    textAlign: 'center', padding: '60px 24px',
    background: '#1a1b26', border: '1px solid #2a2d3e', borderRadius: 12,
  },

  // Two-pane layout
  panes: {
    display: 'flex', gap: 0, flex: 1, minHeight: 0,
    border: '1px solid #2a2d3e', borderRadius: 12, overflow: 'hidden',
  },

  // Left sidebar
  sidebar: {
    width: 190, flexShrink: 0,
    background: '#13141c',
    borderRight: '1px solid #2a2d3e',
    overflowY: 'auto',
    padding: '8px 0',
  },
  sidebarLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '1px',
    color: '#4a4d66', padding: '4px 12px 8px', textTransform: 'uppercase',
  },
  groupHeader: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px 2px', marginTop: 4,
  },
  folderRow: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '8px 12px', cursor: 'pointer',
    borderLeft: '2px solid transparent',
    transition: 'background 0.1s',
  },
  folderRowActive: {
    background: '#1a1b26',
    borderLeftColor: '#6366f1',
  },
  folderIcon: { fontSize: 13, flexShrink: 0, width: 18, textAlign: 'center', lineHeight: 1 },
  folderLabel: { fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  folderBadge: {
    fontSize: 10, fontWeight: 700, color: '#5c5f7a',
    background: '#2a2d3e', borderRadius: 10,
    padding: '1px 6px', flexShrink: 0,
  },

  // Right file pane
  filePane: {
    flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#1a1b26',
  },
  filePaneHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid #2a2d3e', flexShrink: 0,
    background: '#13141c',
  },
  filePaneTitle: { fontSize: 14, fontWeight: 700 },
  fileCountBadge: {
    fontSize: 11, color: '#5c5f7a', background: '#2a2d3e',
    borderRadius: 10, padding: '1px 7px',
  },
  searchInput: {
    background: '#1a1b26', border: '1px solid #2a2d3e',
    borderRadius: 6, padding: '5px 10px',
    color: '#e2e8f0', fontSize: 12, outline: 'none', width: 180,
  },
  fileRowHeader: {
    background: '#0d0e14', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.8px', textTransform: 'uppercase', color: '#4a4d66',
    flexShrink: 0,
  },
  fileScroll: { overflowY: 'auto', flex: 1 },
  fileRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.2fr 0.6fr 2fr 145px',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #0a0b11',
  },
  emptyFolder: {
    padding: '48px 0', textAlign: 'center', color: '#4a4d66', fontSize: 13,
  },
  colName: { display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' },
  colMeta: { fontSize: 12, color: '#9899b8', paddingRight: 8 },
  colCommit: { fontSize: 12, color: '#5c5f7a', paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  colActions: { display: 'flex', gap: 6, justifyContent: 'flex-end' },
  fileName: { fontSize: 13, fontWeight: 500, color: '#e2e8f0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actionBtn: {
    background: '#2a2d3e', border: '1px solid #334155',
    borderRadius: 6, padding: '4px 10px',
    color: '#94a3b8', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  deleteBtn: { background: '#1a0e0e', borderColor: '#7f1d1d', color: '#fca5a5' },
  lockBadge: {
    fontSize: 10, color: '#fcd34d', background: '#1c1400',
    border: '1px solid #92400e', borderRadius: 4,
    padding: '1px 6px', flexShrink: 0, whiteSpace: 'nowrap',
  },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: '#1a1b26', border: '1px solid #334155',
    borderRadius: 12, padding: 28, maxWidth: 420, width: '100%',
  },
}
