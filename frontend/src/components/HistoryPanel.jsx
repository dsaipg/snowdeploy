import { useState, useEffect } from 'react'
import { deployApi } from '../api/client'
import config from '../config'

const STATUS_COLORS = {
  queued:  { color: '#a5b4fc', bg: '#1e1b4b' },
  running: { color: '#7dd3fc', bg: '#0c1a2e' },
  success: { color: '#86efac', bg: '#0d2d1e' },
  failed:  { color: '#fca5a5', bg: '#1a0e0e' },
  skipped: { color: '#94a3b8', bg: '#1c1917' },
}

export default function HistoryPanel() {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  const load = () => {
    setLoading(true)
    deployApi.getHistory(config.historyLimit)
      .then(res => setRuns(res.data.runs))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h2 style={styles.heading}>Deployment History</h2>
        <button style={styles.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>

      {loading ? (
        <p style={{ color: '#5c5f7a', padding: 16 }}>Loading history…</p>
      ) : runs.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
          <p style={{ color: '#9899b8' }}>No deployments yet.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {runs.map(run => {
            const c = STATUS_COLORS[run.overall_status] || STATUS_COLORS.queued
            const isOpen = expanded === run.run_id
            return (
              <div key={run.run_id} style={styles.card}>
                <div style={styles.cardHeader} onClick={() => setExpanded(isOpen ? null : run.run_id)}>
                  <span style={{ ...styles.badge, background: c.bg, color: c.color }}>
                    {run.overall_status}
                  </span>
                  <span style={styles.runId}>{run.run_id.slice(-20)}</span>
                  <span style={styles.meta}>{fmt(run.triggered_at)}</span>
                  <span style={styles.fileCount}>{run.files.length} file{run.files.length !== 1 ? 's' : ''}</span>
                  <span style={{ color: '#5c5f7a', marginLeft: 'auto' }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {isOpen && (
                  <div style={styles.cardBody}>
                    <div style={styles.section}>
                      <span style={styles.sectionLabel}>Files</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {run.files.map(f => (
                          <span key={f} style={styles.filePill}>{f}</span>
                        ))}
                      </div>
                    </div>

                    {run.tasks.length > 0 && (
                      <div style={styles.section}>
                        <span style={styles.sectionLabel}>Tasks</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                          {run.tasks.map(task => {
                            const tc = STATUS_COLORS[task.status] || STATUS_COLORS.queued
                            return (
                              <div key={task.task_id} style={styles.taskRow}>
                                <span style={{ ...styles.badge, background: tc.bg, color: tc.color, fontSize: 10 }}>
                                  {task.status}
                                </span>
                                <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                                  {task.task_id}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div style={styles.timing}>
                      <span>Started: {fmt(run.started_at)}</span>
                      <span>Finished: {fmt(run.finished_at)}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: { maxWidth: 900, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heading: { fontSize: 18, fontWeight: 700, color: '#f1f5f9' },
  refreshBtn: {
    background: 'transparent', border: '1px solid #2a2d3e',
    borderRadius: 7, padding: '7px 14px',
    color: '#9899b8', fontSize: 13, cursor: 'pointer',
  },
  empty: { textAlign: 'center', padding: '60px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#1a1b26', border: '1px solid #2a2d3e', borderRadius: 10, overflow: 'hidden' },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 16px', cursor: 'pointer',
  },
  badge: { fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5 },
  runId: { fontSize: 12, color: '#5c5f7a', fontFamily: 'monospace' },
  meta: { fontSize: 12, color: '#9899b8' },
  fileCount: { fontSize: 12, color: '#9899b8', marginLeft: 'auto' },
  cardBody: {
    padding: '0 16px 16px', borderTop: '1px solid #2a2d3e',
    paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14,
  },
  section: {},
  sectionLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#5c5f7a' },
  filePill: {
    background: '#13141c', border: '1px solid #2a2d3e',
    borderRadius: 5, padding: '3px 8px',
    fontSize: 12, color: '#94a3b8', fontFamily: 'monospace',
  },
  taskRow: { display: 'flex', alignItems: 'center', gap: 10 },
  timing: { display: 'flex', gap: 24, fontSize: 12, color: '#5c5f7a' },
}
