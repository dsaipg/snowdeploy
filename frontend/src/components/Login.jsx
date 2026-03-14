import { useState, useEffect } from 'react'
import { authApi } from '../api/client'
import config from '../config'

export default function Login({ onLogin }) {
  const [teams, setTeams] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [teamId, setTeamId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (config.authMode === 'mock') {
      authApi.getTeams()
        .then(res => {
          setTeams(res.data)
          if (res.data.length > 0) setTeamId(res.data[0].id)
        })
        .catch(() => setError('Could not load teams. Is the backend running?'))
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(username, password, teamId)
      localStorage.setItem('sql_portal_token', res.data.access_token)
      localStorage.setItem('sql_portal_user', JSON.stringify(res.data.user))
      onLogin(res.data.user)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo / Title */}
        <div style={styles.header}>
          <div style={styles.icon}>❄️</div>
          <h1 style={styles.title}>{config.appName}</h1>
          <p style={styles.subtitle}>Sign in to access your team's SQL workspace</p>
        </div>

        {config.authMode === 'oauth' ? (
          <div>
            <a href="/auth/oauth/login" style={styles.oauthBtn}>
              Sign in with SSO
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Username</label>
              <input
                style={styles.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your.name"
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

            <div style={styles.field}>
              <label style={styles.label}>Your Team</label>
              <select
                style={{ ...styles.input, cursor: 'pointer' }}
                value={teamId}
                onChange={e => setTeamId(e.target.value)}
                required
              >
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button style={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        <p style={styles.hint}>
          {config.authMode === 'mock'
            ? '⚙️ Running in mock mode — any username/password works'
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
    transition: 'border-color 0.15s',
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
    marginTop: '4px',
  },
  oauthBtn: {
    display: 'block',
    background: '#2563eb',
    borderRadius: '8px',
    padding: '12px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    textAlign: 'center',
    textDecoration: 'none',
  },
  hint: { textAlign: 'center', fontSize: '12px', color: '#475569', marginTop: '24px' },
}
