/**
 * client.js — Axios API client
 * Automatically attaches the JWT from localStorage to every request.
 */
import axios from 'axios'
import config from '../config'

const api = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 15000,
})

// ── Request interceptor: attach auth token ─────────────────────────
api.interceptors.request.use((req) => {
  const token = localStorage.getItem('sql_portal_token')
  if (token) req.headers.Authorization = `Bearer ${token}`
  return req
})

// ── Response interceptor: handle 401 ──────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sql_portal_token')
      localStorage.removeItem('sql_portal_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ───────────────────────────────────────────────────────────
export const authApi = {
  login: (username, password, teamId) =>
    api.post('/auth/login', { username, password, team_id: teamId }),
  getTeams: () => api.get('/auth/teams'),
}

// ── App Config ─────────────────────────────────────────────────────
export const configApi = {
  getAppConfig: () => api.get('/config'),
}

// ── Files ──────────────────────────────────────────────────────────
export const filesApi = {
  listFiles: () => api.get('/files'),
  getFile: (filename) => api.get(`/files/${encodeURIComponent(filename)}`),
  saveFile: (filename, content, commitMessage) =>
    api.post('/files', { filename, content, commit_message: commitMessage }),
  deleteFile: (filename) => api.delete(`/files/${encodeURIComponent(filename)}`),
}

// ── Deploy ─────────────────────────────────────────────────────────
export const deployApi = {
  trigger: (files, environment, notes) =>
    api.post('/deploy', { files, environment, notes }),
  getHistory: (limit = 10) => api.get(`/deploy/history?limit=${limit}`),
}

// ── Status ─────────────────────────────────────────────────────────
export const statusApi = {
  getStatus: (runId, dagId) =>
    api.get(`/status/${runId}${dagId ? `?dag_id=${dagId}` : ''}`),
}

export default api
