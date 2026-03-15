import { useState } from 'react'
import { authApi } from '../api/client'
import config from '../config'

export default function Login({ onLogin }) {
  // Check for a remembered session
  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem('sql_portal_user')) } catch { return null }
  })()

  const [showForm, setShowForm] = useState(!storedUser)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(username, password, null)
      localStorage.setItem('sql_portal_token', res.data.access_token)
      localStorage.setItem('sql_portal_user', JSON.stringify(res.data.user))
      onLogin(res.data.user)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignInAs = () => {
    // Token is still in localStorage — just restore the session directly
    onLogin(storedUser)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.icon}>❄️</div>
          <h1 style={styles.title}>{config.appName}</h1>
          <p style={styles.subtitle}>Self-service SQL deployment portal</p>
        </div>

        {config.authMode === 'oauth' ? (
          <a href="/auth/oauth/login" style={styles.btn}>Sign in with SSO</a>

        ) : !showForm && storedUser ? (
          /* ── Returning user — one-click sign in ── */
          <div style={styles.returning}>
            <div style={styles.avatar}>{storedUser.display_name?.[0]?.toUpperCase() || '?'}</div>
            <div style={styles.returningName}>{storedUser.display_name}</div>
            <div style={styles.returningTeam}>{storedUser.team_name}</div>
            <button style={styles.btn} onClick={handleSignInAs}>
              Sign in
            </button>
            <button style={styles.switchBtn} onClick={() => { setShowForm(true); setError('') }}>
              Not you? Sign in differently
            </button>
          </div>

        ) : (
          /* ── Full login form ── */
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Username</label>
              <input
                style={styles.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. alice"
                required
                autoFocus
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button style={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            {storedUser && (
              <button
                type="button"
                style={styles.switchBtn}
                onClick={() => { setShowForm(false); setError('') }}
              >
                ← Back
              </button>
            )}
          </form>
        )}

        <p style={styles.hint}>
          {config.authMode === 'mock'
            ? '⚙️ Dev mode — try alice / rita with password "password"'
            : '🔐 Secured via SSO'}
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f1117',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    background: '#161b27',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
  },
  header: { textAlign: 'center', marginBottom: '32px' },
  icon: { fontSize: '40px', marginBottom: '12px' },
  title: { fontSize: '22px', fontWeight: 700, color: '#f1f5f9', marginBottom: '6px' },
  subtitle: { fontSize: '14px', color: '#64748b' },
  returning: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
  },
  avatar: {
    width: 56, height: 56, borderRadius: '50%',
    background: '#1d4ed8', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, fontWeight: 700,
  },
  returningName: { fontSize: 18, fontWeight: 700, color: '#f1f5f9' },
  returningTeam: {
    fontSize: 13, color: '#86efac',
    background: '#0d2d1e', border: '1px solid #16a34a',
    borderRadius: 20, padding: '3px 12px', marginBottom: 8,
  },
  form: { display: 'flex', flexDirection: 'column', gap: '18px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#94a3b8' },
  input: {
    background: '#0f1117',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#e2e8f0',
    fontSize: '14px',
    outline: 'none',
  },
  error: {
    background: '#450a0a',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fca5a5',
    fontSize: '13px',
  },
  btn: {
    background: '#2563eb',
    border: 'none',
    borderRadius: '8px',
    padding: '12px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: '4px',
  },
  switchBtn: {
    background: 'transparent',
    border: 'none',
    color: '#475569',
    fontSize: '13px',
    cursor: 'pointer',
    marginTop: '4px',
    textDecoration: 'underline',
  },
  hint: { textAlign: 'center', fontSize: '12px', color: '#475569', marginTop: '24px' },
}
