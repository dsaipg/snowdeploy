import config from '../config'

export default function Layout({ user, onLogout, activeTab, setActiveTab, children }) {
  const tabs = [
    { id: 'files', label: '📂 Files' },
    { id: 'editor', label: '✏️ Editor' },
    { id: 'deploy', label: '🚀 Deploy' },
    { id: 'history', label: '📋 History' },
  ]

  return (
    <div style={styles.shell}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header style={styles.topbar}>
        <div style={styles.brand}>
          <span style={{ fontSize: 20 }}>❄️</span>
          <span style={styles.brandName}>{config.appName}</span>
        </div>
        <div style={styles.teamBadge}>
          <span style={styles.teamDot} />
          {user.team_name}
        </div>
        <div style={styles.userArea}>
          <span style={styles.userLabel}>{user.display_name}</span>
          <button style={styles.logoutBtn} onClick={onLogout}>Sign out</button>
        </div>
      </header>

      {/* ── Tab nav ──────────────────────────────────────────── */}
      <nav style={styles.nav}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            style={{ ...styles.navTab, ...(activeTab === tab.id ? styles.navTabActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Content ──────────────────────────────────────────── */}
      <main style={styles.content}>
        {children}
      </main>
    </div>
  )
}

const styles = {
  shell: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f1117' },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '0 24px',
    height: '56px',
    background: '#161b27',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'center', gap: '10px' },
  brandName: { fontSize: '15px', fontWeight: 700, color: '#f1f5f9' },
  teamBadge: {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: '#0d2d1e', border: '1px solid #16a34a',
    borderRadius: '20px', padding: '3px 12px',
    fontSize: '12px', fontWeight: 600, color: '#86efac',
    marginLeft: 'auto',
  },
  teamDot: { width: 6, height: 6, borderRadius: '50%', background: '#22c55e' },
  userArea: { display: 'flex', alignItems: 'center', gap: '12px' },
  userLabel: { fontSize: '13px', color: '#64748b' },
  logoutBtn: {
    background: 'transparent', border: '1px solid #1e293b',
    borderRadius: '6px', padding: '4px 10px',
    color: '#64748b', fontSize: '12px', cursor: 'pointer',
  },
  nav: {
    display: 'flex', gap: '2px',
    padding: '0 24px',
    background: '#161b27',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
  },
  navTab: {
    background: 'none', border: 'none',
    padding: '12px 16px',
    color: '#64748b', fontSize: '13px', fontWeight: 500,
    cursor: 'pointer', borderBottom: '2px solid transparent',
    transition: 'all 0.15s',
  },
  navTabActive: { color: '#e2e8f0', borderBottomColor: '#2563eb' },
  content: { flex: 1, overflow: 'auto', padding: '24px' },
}
