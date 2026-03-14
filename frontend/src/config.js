// ─────────────────────────────────────────────────────
// config.js — Frontend configuration
// All values can be overridden via environment variables.
// Set VITE_* vars in .env or docker-compose.
// ─────────────────────────────────────────────────────

const config = {
  // Backend API base URL
  // In dev, Vite proxies /api → backend. In prod, set VITE_API_URL.
  apiBaseUrl: import.meta.env.VITE_API_URL || '/api',

  // App display name (overridable)
  appName: import.meta.env.VITE_APP_NAME || 'SQL Deployment Portal',

  // Auth mode mirrors the backend setting
  // "mock"  — show team selector on login screen
  // "oauth" — show SSO login button only
  authMode: import.meta.env.VITE_AUTH_MODE || 'mock',

  // OAuth redirect URI (only needed when authMode=oauth)
  oauthRedirectUri: import.meta.env.VITE_OAUTH_REDIRECT_URI || window.location.origin + '/auth/callback',

  // How often to poll deployment status (ms)
  statusPollInterval: Number(import.meta.env.VITE_STATUS_POLL_MS) || 3000,

  // How many recent deployments to show in history
  historyLimit: Number(import.meta.env.VITE_HISTORY_LIMIT) || 10,

  // Theme: "dark" | "light"  (dark is default)
  theme: import.meta.env.VITE_THEME || 'dark',
}

export default config
