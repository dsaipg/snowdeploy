/**
 * PromotionPanel.jsx — Environment promotion flow
 *
 * Analysts select files and submit them for review.
 * Once approved (auto in mock mode, via GitHub PR in github mode),
 * a lead clicks Deploy to trigger Airflow against the target environment.
 *
 * Pipeline:  Dev  →  QA  →  Prod
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { filesApi, promotionApi, statusApi } from '../api/client'

const ENV_LABELS = { dev: 'Dev', qa: 'QA', prod: 'Prod' }
const SCHEDULABLE_FOLDERS = ['procedures', 'sql_scripts']
const DAY_MAP = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 }

function buildCron(type, time, day, custom) {
  if (type === 'custom') return custom.trim()
  const [h, m] = (time || '06:00').split(':')
  if (type === 'hourly') return `0 * * * *`
  if (type === 'daily')  return `${m} ${h} * * *`
  if (type === 'weekly') return `${m} ${h} * * ${DAY_MAP[day] ?? 1}`
  return ''
}
const ENV_COLORS = {
  dev:  { bg: '#0d2137', border: '#1d4ed8', text: '#93c5fd', dot: '#3b82f6' },
  qa:   { bg: '#1a1a0d', border: '#a16207', text: '#fde68a', dot: '#eab308' },
  prod: { bg: '#0d2116', border: '#15803d', text: '#86efac', dot: '#22c55e' },
}
const STATUS_CONFIG = {
  open:     { label: 'Awaiting approval', color: '#f59e0b', bg: '#1c1500' },
  approved: { label: 'Approved',          color: '#22c55e', bg: '#0d1f0d' },
  deployed: { label: 'Deployed',          color: '#64748b', bg: '#0f172a' },
  rejected: { label: 'Rejected',          color: '#ef4444', bg: '#1c0a0a' },
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function PromotionPanel({ user }) {
  const [files, setFiles]             = useState([])
  const [summary, setSummary]         = useState(null)
  const [requests, setRequests]       = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])
  const [targetEnv, setTargetEnv]     = useState('qa')   // qa | prod
  const [notes, setNotes]             = useState('')
  const [schedEnabled, setSchedEnabled] = useState(false)
  const [schedType, setSchedType]     = useState('daily')   // hourly|daily|weekly|custom
  const [schedTime, setSchedTime]     = useState('06:00')
  const [schedDay, setSchedDay]       = useState('monday')
  const [schedCustom, setSchedCustom] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [actionLoading, setActionLoading] = useState({})  // requestId → 'approve'|'deploy'
  const [airflowRuns, setAirflowRuns] = useState({})      // requestId → { run_id, dag_id, statusData }
  const [error, setError]             = useState(null)
  const [success, setSuccess]         = useState(null)
  const pollRef = useRef({})

  const load = useCallback(async () => {
    try {
      const [filesRes, summaryRes, requestsRes] = await Promise.all([
        filesApi.listFiles(),
        promotionApi.getSummary(),
        promotionApi.getRequests(),
      ])
      setFiles(filesRes.data.files || [])
      setSummary(summaryRes.data)
      setRequests(requestsRes.data || [])
    } catch (e) {
      setError('Failed to load promotion data')
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [load])

  const toggleFile = (path) => {
    setSelectedFiles(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    )
  }

  const handleSubmit = async () => {
    if (!selectedFiles.length) return
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    const schedule = schedEnabled ? buildCron(schedType, schedTime, schedDay, schedCustom) : null
    try {
      await promotionApi.submit(selectedFiles, 'dev', targetEnv, notes, schedule)
      setSelectedFiles([])
      setNotes('')
      setSchedEnabled(false)
      setSuccess(`Submitted ${selectedFiles.length} file(s) for ${ENV_LABELS[targetEnv]} review${schedule ? ` — scheduled: ${schedule}` : ''}`)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = async (requestId) => {
    setActionLoading(p => ({ ...p, [requestId]: 'approve' }))
    setError(null)
    try {
      await promotionApi.approve(requestId)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Approval failed')
    } finally {
      setActionLoading(p => ({ ...p, [requestId]: null }))
    }
  }

  const handleDeploy = async (requestId) => {
    setActionLoading(p => ({ ...p, [requestId]: 'deploy' }))
    setError(null)
    try {
      const res = await promotionApi.deploy(requestId)
      const { run_id, dag_id } = res.data
      setAirflowRuns(p => ({ ...p, [requestId]: { run_id, dag_id, statusData: null } }))
      startPolling(requestId, run_id, dag_id)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Deploy failed')
    } finally {
      setActionLoading(p => ({ ...p, [requestId]: null }))
    }
  }

  const startPolling = useCallback((requestId, run_id, dag_id) => {
    if (pollRef.current[requestId]) clearInterval(pollRef.current[requestId])
    const interval = setInterval(async () => {
      try {
        const res = await statusApi.getStatus(run_id, dag_id)
        const statusData = res.data
        setAirflowRuns(p => ({ ...p, [requestId]: { run_id, dag_id, statusData } }))
        if (['success', 'failed'].includes(statusData.overall_status)) {
          clearInterval(pollRef.current[requestId])
          delete pollRef.current[requestId]
        }
      } catch { /* non-fatal */ }
    }, 3000)
    pollRef.current[requestId] = interval
  }, [])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => Object.values(pollRef.current).forEach(clearInterval)
  }, [])

  const activeRequests = requests.filter(r => r.status !== 'deployed' && r.status !== 'rejected')
  const recentDeployed = requests.filter(r => r.status === 'deployed').slice(-5).reverse()

  return (
    <div style={s.page}>

      {/* ── Pipeline visualization ──────────────────────────────── */}
      <div style={s.pipeline}>
        {['dev', 'qa', 'prod'].map((env, i) => {
          const c = ENV_COLORS[env]
          const count = env === 'dev'
            ? files.length
            : env === 'qa'
            ? (summary?.qa_deployed_count ?? '—')
            : (summary?.prod_deployed_count ?? '—')
          return (
            <div key={env} style={s.pipelineRow}>
              {i > 0 && <div style={s.arrow}>→</div>}
              <div style={{ ...s.envBox, background: c.bg, borderColor: c.border }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...s.envDot, background: c.dot }} />
                  <span style={{ ...s.envLabel, color: c.text }}>{ENV_LABELS[env]}</span>
                </div>
                <span style={{ ...s.envCount, color: c.text }}>{count} files</span>
                <span style={{ ...s.envDesc, color: c.text }}>
                  {env === 'dev'  ? 'Write & save SQL' :
                   env === 'qa'   ? 'Needs lead approval' :
                                    'Needs senior approval'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={s.body}>

        {/* ── Left: Submit form ──────────────────────────────────── */}
        <div style={s.submitPanel}>
          <div style={s.sectionHeader}>Submit for Review</div>

          {/* Target environment selector */}
          <div style={s.field}>
            <label style={s.label}>Promote to</label>
            <div style={s.envToggle}>
              {['qa', 'prod'].map(env => (
                <button
                  key={env}
                  style={{ ...s.envToggleBtn, ...(targetEnv === env ? s.envToggleBtnActive : {}) }}
                  onClick={() => setTargetEnv(env)}
                >
                  {ENV_LABELS[env]}
                </button>
              ))}
            </div>
          </div>

          {/* File selector */}
          <div style={s.field}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={s.label}>Select files</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={s.bulkBtn} onClick={() => setSelectedFiles(files.map(f => f.path))}>All</button>
                <button style={s.bulkBtn} onClick={() => setSelectedFiles([])}>None</button>
              </div>
            </div>
            <div style={s.fileList}>
              {files.length === 0 && (
                <div style={s.emptyFiles}>No files in your team folder yet</div>
              )}
              {files.map(f => (
                <label key={f.path} style={s.fileRow}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(f.path)}
                    onChange={() => toggleFile(f.path)}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <span style={s.fileName}>{f.path}</span>
                  {f.subfolder && (
                    <span style={s.folderBadge}>{f.subfolder}</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div style={s.field}>
            <label style={s.label}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Adds user segment column for Q2 report"
              style={s.textarea}
              rows={2}
            />
          </div>

          {/* Schedule toggle — only shown when schedulable files selected */}
          {selectedFiles.some(f => SCHEDULABLE_FOLDERS.some(sf => f.startsWith(sf))) && (
            <div style={s.scheduleBox}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={schedEnabled}
                  onChange={e => setSchedEnabled(e.target.checked)}
                  style={{ accentColor: '#6366f1' }}
                />
                <span style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 600 }}>Run on a schedule</span>
              </label>

              {schedEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {/* Type selector */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {['hourly', 'daily', 'weekly', 'custom'].map(t => (
                      <button
                        key={t}
                        style={{ ...s.schedTypeBtn, ...(schedType === t ? s.schedTypeBtnActive : {}) }}
                        onClick={() => setSchedType(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Time picker (not for hourly or custom) */}
                  {(schedType === 'daily' || schedType === 'weekly') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={s.schedLabel}>at (UTC)</span>
                      <input
                        type="time"
                        value={schedTime}
                        onChange={e => setSchedTime(e.target.value)}
                        style={s.schedInput}
                      />
                    </div>
                  )}

                  {/* Day picker (weekly only) */}
                  {schedType === 'weekly' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={s.schedLabel}>on</span>
                      <select
                        value={schedDay}
                        onChange={e => setSchedDay(e.target.value)}
                        style={s.schedInput}
                      >
                        {Object.keys(DAY_MAP).map(d => (
                          <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Custom cron */}
                  {schedType === 'custom' && (
                    <input
                      type="text"
                      value={schedCustom}
                      onChange={e => setSchedCustom(e.target.value)}
                      placeholder="e.g. 0 6 * * 1-5"
                      style={s.schedInput}
                    />
                  )}

                  {/* Preview */}
                  <div style={s.schedPreview}>
                    cron: <code style={{ color: '#a5b4fc' }}>{buildCron(schedType, schedTime, schedDay, schedCustom) || '—'}</code>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div style={s.errorBanner}>{error}</div>}
          {success && <div style={s.successBanner}>{success}</div>}

          <button
            style={{ ...s.submitBtn, opacity: (!selectedFiles.length || submitting) ? 0.5 : 1 }}
            disabled={!selectedFiles.length || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting…' : `Submit ${selectedFiles.length || ''} file(s) to ${ENV_LABELS[targetEnv]}`}
          </button>
        </div>

        {/* ── Right: Active promotions ───────────────────────────── */}
        <div style={s.reviewsPanel}>
          <div style={s.sectionHeader}>
            Active Reviews
            {activeRequests.length > 0 && (
              <span style={s.badge}>{activeRequests.length}</span>
            )}
          </div>

          {activeRequests.length === 0 && (
            <div style={s.emptyState}>
              No pending reviews.
              <br />Select files and submit to start a promotion.
            </div>
          )}

          {activeRequests.map(req => {
            const sc = STATUS_CONFIG[req.status] || STATUS_CONFIG.open
            const loading = actionLoading[req.id]
            return (
              <div key={req.id} style={{ ...s.reqCard, background: sc.bg, borderColor: sc.color + '44' }}>
                <div style={s.reqHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...s.statusDot, background: sc.color }} />
                    <span style={{ ...s.statusLabel, color: sc.color }}>{sc.label}</span>
                    <span style={s.envPill}>
                      {ENV_LABELS[req.from_env]} → {ENV_LABELS[req.to_env]}
                    </span>
                  </div>
                  <span style={s.reqTime}>{fmt(req.submitted_at)}</span>
                </div>

                <div style={s.reqMeta}>
                  Submitted by <strong style={{ color: '#e2e8f0' }}>{req.submitted_by}</strong>
                </div>

                <div style={s.fileChips}>
                  {req.files.map(f => (
                    <span key={f} style={s.chip}>{f}</span>
                  ))}
                </div>

                {req.notes && (
                  <div style={s.reqNotes}>{req.notes}</div>
                )}
                {req.schedule && (
                  <div style={s.schedPill}>🕐 Scheduled: <code style={{ color: '#a5b4fc' }}>{req.schedule}</code></div>
                )}

                {req.pr_url && (
                  <a href={req.pr_url} target="_blank" rel="noopener noreferrer" style={s.prLink}>
                    View GitHub PR →
                  </a>
                )}

                <div style={s.reqActions}>
                  {req.status === 'open' && (
                    req.submitted_by === user?.display_name ? (
                      <span style={s.waitingLabel}>Waiting for a teammate to approve</span>
                    ) : (
                      <button
                        style={s.approveBtn}
                        disabled={!!loading}
                        onClick={() => handleApprove(req.id)}
                      >
                        {loading === 'approve' ? 'Approving…' : 'Approve'}
                      </button>
                    )
                  )}
                  {req.status === 'approved' && (
                    <button
                      style={s.deployBtn}
                      disabled={!!loading}
                      onClick={() => handleDeploy(req.id)}
                    >
                      {loading === 'deploy' ? 'Deploying…' : `Deploy to ${ENV_LABELS[req.to_env]}`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Recent deployed */}
          {recentDeployed.length > 0 && (
            <>
              <div style={{ ...s.sectionHeader, marginTop: 24 }}>Recently Deployed</div>
              {recentDeployed.map(req => {
                const run = airflowRuns[req.id]
                return (
                  <div key={req.id} style={s.deployedCard}>
                    <div style={s.deployedRow}>
                      <span style={s.deployedEnv}>{ENV_LABELS[req.from_env]} → {ENV_LABELS[req.to_env]}</span>
                      <span style={s.deployedFiles}>{req.files.join(', ')}</span>
                      <span style={s.deployedTime}>{fmt(req.deployed_at)}</span>
                    </div>
                    {run && <AirflowStatus run={run} />}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const TASK_STATUS_COLOR = {
  queued:  '#475569',
  running: '#22d3ee',
  success: '#22c55e',
  failed:  '#ef4444',
  skipped: '#64748b',
}

function AirflowStatus({ run }) {
  const { statusData } = run
  if (!statusData) {
    return (
      <div style={as.wrap}>
        <span style={as.spinner}>⟳</span>
        <span style={{ color: '#64748b', fontSize: 12 }}>Triggering Airflow…</span>
      </div>
    )
  }

  const { overall_status, tasks, started_at, finished_at } = statusData
  const isRunning = overall_status === 'running' || overall_status === 'queued'
  const statusColor = TASK_STATUS_COLOR[overall_status] || '#64748b'

  return (
    <div style={as.wrap}>
      <div style={as.header}>
        <span style={{ ...as.badge, color: statusColor, borderColor: statusColor + '44', background: statusColor + '11' }}>
          {isRunning ? '⟳ ' : overall_status === 'success' ? '✓ ' : '✗ '}
          Airflow: {overall_status}
        </span>
        {finished_at && (
          <span style={as.time}>finished {new Date(finished_at).toLocaleTimeString()}</span>
        )}
      </div>
      {tasks?.length > 0 && (
        <div style={as.tasks}>
          {tasks.map(task => (
            <div key={task.task_id} style={as.taskRow}>
              <span style={{ ...as.taskDot, background: TASK_STATUS_COLOR[task.status] || '#475569' }} />
              <span style={as.taskName}>{task.task_id.replace(/^run_sql_\d+_/, '')}</span>
              <span style={{ ...as.taskStatus, color: TASK_STATUS_COLOR[task.status] || '#475569' }}>
                {task.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const as = {
  wrap: {
    marginTop: 8, padding: '8px 10px',
    background: '#0a0f1a', borderRadius: 6,
    border: '1px solid #1e293b',
  },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  badge: {
    fontSize: 11, fontWeight: 600, border: '1px solid',
    borderRadius: 4, padding: '2px 7px',
  },
  time: { fontSize: 11, color: '#475569' },
  tasks: { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 },
  taskRow: { display: 'flex', alignItems: 'center', gap: 6 },
  taskDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  taskName: { fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', flex: 1 },
  taskStatus: { fontSize: 11, fontWeight: 500 },
}

const s = {
  page: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 16 },
  pipeline: {
    display: 'flex', alignItems: 'center', gap: 0,
    background: '#161b27', border: '1px solid #1e293b',
    borderRadius: 10, padding: '16px 24px', flexShrink: 0,
  },
  pipelineRow: { display: 'flex', alignItems: 'center' },
  arrow: { fontSize: 20, color: '#334155', margin: '0 12px' },
  envBox: {
    display: 'flex', flexDirection: 'column', gap: 4,
    border: '1px solid', borderRadius: 8,
    padding: '12px 20px', minWidth: 150,
  },
  envDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  envLabel: { fontSize: 14, fontWeight: 700 },
  envCount: { fontSize: 22, fontWeight: 700 },
  envDesc: { fontSize: 11, opacity: 0.7 },
  body: { display: 'flex', gap: 16, flex: 1, minHeight: 0 },
  submitPanel: {
    display: 'flex', flexDirection: 'column', gap: 12,
    background: '#161b27', border: '1px solid #1e293b',
    borderRadius: 10, padding: 20, width: 340, flexShrink: 0,
    overflowY: 'auto',
  },
  reviewsPanel: {
    display: 'flex', flexDirection: 'column', gap: 10,
    background: '#161b27', border: '1px solid #1e293b',
    borderRadius: 10, padding: 20, flex: 1, overflowY: 'auto',
  },
  sectionHeader: {
    fontSize: 12, fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  badge: {
    background: '#1e293b', color: '#94a3b8',
    borderRadius: 10, padding: '1px 7px', fontSize: 11,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, color: '#64748b', fontWeight: 500 },
  envToggle: { display: 'flex', gap: 6 },
  envToggleBtn: {
    flex: 1, padding: '7px 0', border: '1px solid #1e293b',
    borderRadius: 6, background: 'transparent',
    color: '#64748b', fontSize: 13, cursor: 'pointer',
  },
  envToggleBtnActive: {
    background: '#1e3a5f', borderColor: '#2563eb', color: '#93c5fd', fontWeight: 600,
  },
  fileList: {
    border: '1px solid #1e293b', borderRadius: 6,
    maxHeight: 220, overflowY: 'auto',
    background: '#0f1117',
  },
  emptyFiles: { color: '#475569', fontSize: 12, padding: '12px 16px', textAlign: 'center' },
  fileRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', cursor: 'pointer',
    borderBottom: '1px solid #1e293b',
    color: '#94a3b8', fontSize: 12,
  },
  fileName: { flex: 1, fontFamily: 'monospace' },
  folderBadge: {
    fontSize: 10, color: '#475569',
    background: '#1e293b', borderRadius: 4,
    padding: '1px 5px',
  },
  bulkBtn: {
    background: 'transparent', border: '1px solid #1e293b',
    borderRadius: 4, padding: '2px 8px',
    color: '#64748b', fontSize: 11, cursor: 'pointer',
  },
  textarea: {
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 6, padding: '8px 12px',
    color: '#e2e8f0', fontSize: 13, resize: 'none',
    fontFamily: 'inherit', outline: 'none',
  },
  errorBanner: {
    background: '#1c0a0a', border: '1px solid #dc2626',
    borderRadius: 6, padding: '8px 12px',
    color: '#fca5a5', fontSize: 12,
  },
  successBanner: {
    background: '#0d1f0d', border: '1px solid #16a34a',
    borderRadius: 6, padding: '8px 12px',
    color: '#86efac', fontSize: 12,
  },
  submitBtn: {
    background: '#2563eb', color: '#fff',
    border: 'none', borderRadius: 7,
    padding: '10px 0', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.15s',
  },
  emptyState: {
    color: '#475569', fontSize: 13, textAlign: 'center',
    padding: '32px 0', lineHeight: 1.6,
  },
  reqCard: {
    border: '1px solid', borderRadius: 8,
    padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  reqHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  statusLabel: { fontSize: 12, fontWeight: 600 },
  envPill: {
    fontSize: 11, color: '#64748b',
    background: '#1e293b', borderRadius: 10,
    padding: '1px 8px',
  },
  reqTime: { fontSize: 11, color: '#475569' },
  reqMeta: { fontSize: 12, color: '#64748b' },
  fileChips: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip: {
    fontSize: 11, fontFamily: 'monospace',
    color: '#93c5fd', background: '#0d2137',
    border: '1px solid #1d4ed844',
    borderRadius: 4, padding: '2px 7px',
  },
  reqNotes: {
    fontSize: 12, color: '#94a3b8',
    fontStyle: 'italic',
  },
  prLink: {
    fontSize: 12, color: '#60a5fa',
    textDecoration: 'none',
  },
  reqActions: { display: 'flex', gap: 8, marginTop: 4 },
  approveBtn: {
    background: '#15803d', color: '#dcfce7',
    border: 'none', borderRadius: 6,
    padding: '6px 14px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
  },
  waitingLabel: { fontSize: 12, color: '#475569', fontStyle: 'italic' },
  deployBtn: {
    background: '#1d4ed8', color: '#dbeafe',
    border: 'none', borderRadius: 6,
    padding: '6px 14px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
  },
  deployedCard: {
    background: '#0f172a', borderRadius: 6,
    padding: '7px 10px', marginBottom: 4,
  },
  deployedRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 12,
  },
  deployedEnv: {
    color: '#22c55e', fontWeight: 600,
    background: '#0d2116', borderRadius: 4,
    padding: '2px 7px', flexShrink: 0,
  },
  deployedFiles: { color: '#64748b', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  deployedTime: { color: '#334155', flexShrink: 0 },
  scheduleBox: {
    background: '#0f0f1a', border: '1px solid #3730a3',
    borderRadius: 7, padding: '10px 12px',
  },
  schedTypeBtn: {
    background: 'transparent', border: '1px solid #1e293b',
    borderRadius: 4, padding: '3px 10px',
    color: '#64748b', fontSize: 11, cursor: 'pointer',
  },
  schedTypeBtnActive: {
    background: '#1e1b4b', borderColor: '#6366f1', color: '#a5b4fc', fontWeight: 600,
  },
  schedLabel: { fontSize: 11, color: '#64748b', flexShrink: 0 },
  schedInput: {
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 5, padding: '4px 8px',
    color: '#e2e8f0', fontSize: 12, outline: 'none', flex: 1,
  },
  schedPreview: {
    fontSize: 11, color: '#475569',
    background: '#0a0f1a', borderRadius: 4,
    padding: '4px 8px',
  },
  schedPill: {
    fontSize: 11, color: '#64748b',
    background: '#0f0f1a', border: '1px solid #3730a3',
    borderRadius: 4, padding: '3px 8px',
  },
}
