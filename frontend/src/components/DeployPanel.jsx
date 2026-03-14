import { useState, useEffect, useRef } from 'react'
import { filesApi, deployApi, statusApi } from '../api/client'
import config from '../config'

const STATUS_COLORS = {
  queued:  { bg: '#1e1b4b', border: '#4338ca', text: '#a5b4fc', dot: '#6366f1' },
  running: { bg: '#0c1a2e', border: '#0ea5e9', text: '#7dd3fc', dot: '#38bdf8' },
  success: { bg: '#0d2d1e', border: '#16a34a', text: '#86efac', dot: '#22c55e' },
  failed:  { bg: '#1a0e0e', border: '#ef4444', text: '#fca5a5', dot: '#f87171' },
  skipped: { bg: '#1c1917', border: '#64748b', text: '#94a3b8', dot: '#94a3b8' },
}

export default function DeployPanel() {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [environment, setEnvironment] = useState('dev')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [activeRun, setActiveRun] = useState(null)
  const [runStatus, setRunStatus] = useState(null)
  const pollRef = useRef(null)

  // Load files
  useEffect(() => {
    filesApi.listFiles()
      .then(res => setFiles(res.data.files))
      .finally(() => setLoading(false))
  }, [])

  // Poll status when there's an active run
  useEffect(() => {
    if (!activeRun) { clearInterval(pollRef.current); return }

    const poll = async () => {
      try {
        const res = await statusApi.getStatus(activeRun.run_id, activeRun.dag_id)
        setRunStatus(res.data)
        if (['success', 'failed'].includes(res.data.overall_status)) {
          clearInterval(pollRef.current)
          setDeploying(false)
        }
      } catch { /* silent */ }
    }

    poll()
    pollRef.current = setInterval(poll, config.statusPollInterval)
    return () => clearInterval(pollRef.current)
  }, [activeRun])

  const toggleFile = (name) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(files.map(f => f.path)))
  const clearAll = () => setSelected(new Set())

  const handleDeploy = async () => {
    if (selected.size === 0) return
    setDeploying(true)
    setRunStatus(null)
    try {
      const res = await deployApi.trigger([...selected], environment, notes || undefined)
      setActiveRun(res.data)
    } catch (err) {
      alert(err.response?.data?.detail || 'Deploy failed.')
      setDeploying(false)
    }
  }

  const overallColors = runStatus ? STATUS_COLORS[runStatus.overall_status] : null

  return (
    <div style={styles.wrap}>
      <div style={styles.cols}>
        {/* ── Left: file selector ──────────────────────── */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Select Files to Deploy</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.smallBtn} onClick={selectAll}>All</button>
              <button style={styles.smallBtn} onClick={clearAll}>None</button>
            </div>
          </div>

          {loading ? (
            <p style={{ color: '#475569', padding: 16 }}>Loading…</p>
          ) : files.length === 0 ? (
            <p style={{ color: '#475569', padding: 16 }}>No SQL files in your folder yet.</p>
          ) : (
            <div style={styles.fileList}>
              {files.map(f => (
                <label key={f.path} style={{ ...styles.fileRow, ...(selected.has(f.path) ? styles.fileRowSelected : {}) }}>
                  <input
                    type="checkbox"
                    checked={selected.has(f.path)}
                    onChange={() => toggleFile(f.path)}
                    style={styles.checkbox}
                  />
                  <span style={styles.fileName}>{f.path}</span>
                </label>
              ))}
            </div>
          )}

          {/* Deploy options */}
          <div style={styles.options}>
            <div style={styles.optRow}>
              <label style={styles.optLabel}>Environment</label>
              <select
                style={styles.select}
                value={environment}
                onChange={e => setEnvironment(e.target.value)}
              >
                <option value="dev">dev</option>
                <option value="staging">staging</option>
                <option value="prod">prod</option>
              </select>
            </div>

            <div style={styles.optRow}>
              <label style={styles.optLabel}>Notes (optional)</label>
              <input
                style={styles.noteInput}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Describe this deployment…"
              />
            </div>
          </div>

          <button
            style={{
              ...styles.deployBtn,
              opacity: (selected.size === 0 || deploying) ? 0.5 : 1,
              cursor: (selected.size === 0 || deploying) ? 'not-allowed' : 'pointer',
            }}
            onClick={handleDeploy}
            disabled={selected.size === 0 || deploying}
          >
            {deploying ? '⏳ Deploying…' : `🚀 Deploy ${selected.size > 0 ? `(${selected.size} file${selected.size > 1 ? 's' : ''})` : ''}`}
          </button>
        </div>

        {/* ── Right: status panel ──────────────────────── */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Deployment Status</h3>
            {activeRun && (
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
                {activeRun.run_id.slice(-12)}
              </span>
            )}
          </div>

          {!runStatus && !deploying && (
            <div style={styles.emptyStatus}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🚀</div>
              <p style={{ color: '#475569', fontSize: 13 }}>Select files and hit Deploy to begin.</p>
            </div>
          )}

          {deploying && !runStatus && (
            <div style={styles.emptyStatus}>
              <div style={styles.spinner} />
              <p style={{ color: '#7dd3fc', fontSize: 13, marginTop: 12 }}>Triggering deployment…</p>
            </div>
          )}

          {runStatus && (
            <div>
              {/* Overall badge */}
              <div style={{
                ...styles.overallBadge,
                background: overallColors.bg,
                border: `1px solid ${overallColors.border}`,
                color: overallColors.text,
              }}>
                <span style={{ ...styles.dot, background: overallColors.dot }} />
                {runStatus.overall_status.toUpperCase()}
                {runStatus.overall_status === 'running' && <span style={styles.pulse} />}
              </div>

              {/* Task list */}
              <div style={styles.taskList}>
                {runStatus.tasks.map((task, i) => {
                  const c = STATUS_COLORS[task.status]
                  return (
                    <div key={task.task_id} style={styles.taskRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...styles.dot, background: c.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: '#e2e8f0', fontFamily: 'monospace' }}>
                          {task.task_id.replace(/^run_sql_\d+_/, '')}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: c.text, fontWeight: 600 }}>
                          {task.status}
                        </span>
                      </div>
                      {task.log && (
                        <pre style={styles.log}>{task.log}</pre>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Timing */}
              {runStatus.finished_at && (
                <p style={{ fontSize: 12, color: '#475569', marginTop: 12 }}>
                  Completed at {new Date(runStatus.finished_at).toLocaleTimeString()}
                </p>
              )}
              {runStatus.error_message && (
                <div style={{ ...styles.log, borderColor: '#ef4444', color: '#fca5a5', marginTop: 12 }}>
                  {runStatus.error_message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  wrap: { maxWidth: 1100, margin: '0 auto' },
  cols: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  panel: {
    background: '#161b27', border: '1px solid #1e293b',
    borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { fontSize: 15, fontWeight: 700, color: '#f1f5f9' },
  smallBtn: {
    background: '#1e293b', border: '1px solid #334155',
    borderRadius: 5, padding: '3px 10px',
    color: '#94a3b8', fontSize: 11, cursor: 'pointer',
  },
  fileList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' },
  fileRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 7,
    border: '1px solid transparent', cursor: 'pointer',
    transition: 'all 0.1s',
  },
  fileRowSelected: { background: '#172033', border: '1px solid #1d4ed8' },
  checkbox: { accentColor: '#2563eb', width: 14, height: 14, cursor: 'pointer' },
  fileName: { fontSize: 13, color: '#e2e8f0', fontFamily: 'monospace' },
  options: { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 },
  optRow: { display: 'flex', flexDirection: 'column', gap: 5 },
  optLabel: { fontSize: 12, fontWeight: 600, color: '#64748b' },
  select: {
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 7, padding: '7px 10px',
    color: '#e2e8f0', fontSize: 13, cursor: 'pointer',
  },
  noteInput: {
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 7, padding: '7px 10px',
    color: '#e2e8f0', fontSize: 13, outline: 'none',
  },
  deployBtn: {
    background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
    border: 'none', borderRadius: 8, padding: '12px',
    color: '#fff', fontSize: 14, fontWeight: 700,
    marginTop: 'auto',
  },
  emptyStatus: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '40px 0',
  },
  overallBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 16px', borderRadius: 8,
    fontSize: 13, fontWeight: 700, marginBottom: 16,
    position: 'relative',
  },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  pulse: {
    position: 'absolute', right: 12,
    width: 8, height: 8, borderRadius: '50%',
    background: '#38bdf8', animation: 'pulse 1.2s infinite',
  },
  taskList: { display: 'flex', flexDirection: 'column', gap: 10 },
  taskRow: {
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 8, padding: '10px 14px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  log: {
    background: '#0a0f1a', border: '1px solid #1e293b',
    borderRadius: 6, padding: '8px 12px',
    fontSize: 11, fontFamily: 'monospace', color: '#64748b',
    whiteSpace: 'pre-wrap', marginTop: 4,
  },
  spinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '3px solid #1e293b', borderTopColor: '#38bdf8',
    animation: 'spin 0.8s linear infinite',
  },
}
