import { useState, useEffect } from 'react'
import { configApi } from './api/client'
import Login from './components/Login'
import Layout from './components/Layout'
import FileBrowser from './components/FileBrowser'
import SqlEditor from './components/SqlEditor'
import HistoryPanel from './components/HistoryPanel'
import PromotionPanel from './components/PromotionPanel'

export default function App() {
  const [user, setUser] = useState(null)
  const [appConfig, setAppConfig] = useState(null)
  const [activeTab, setActiveTab] = useState('files')
  const [openFile, setOpenFile] = useState(null)   // filename to open in editor

  // Session is restored via Login component's returning-user card
  // (Login reads localStorage and calls onLogin on one-click sign-in)

  // Load app config (templates, team info) once logged in
  useEffect(() => {
    if (!user) return
    configApi.getAppConfig()
      .then(res => setAppConfig(res.data))
      .catch(() => { /* non-fatal */ })
  }, [user])

  const handleLogin = (u) => setUser(u)

  const handleLogout = () => {
    localStorage.removeItem('sql_portal_token')
    localStorage.removeItem('sql_portal_user')
    setUser(null)
    setAppConfig(null)
    setOpenFile(null)
  }

  const handleOpenFile = (filename) => {
    setOpenFile(filename)
    setActiveTab('editor')
  }

  const handleNewFile = () => {
    setOpenFile(null)
    setActiveTab('editor')
  }

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <Layout
      user={user}
      onLogout={handleLogout}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      {activeTab === 'files' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <FileBrowser
            onOpenFile={handleOpenFile}
            onNewFile={handleNewFile}
          />
        </div>
      )}
      {activeTab === 'editor' && (
        <SqlEditor
          initialFile={openFile}
          templates={appConfig?.sql_templates || []}
          onFileSaved={(filename) => {
            setOpenFile(filename)
          }}
        />
      )}
      {activeTab === 'history' && (
        <HistoryPanel />
      )}
      {activeTab === 'promote' && (
        <PromotionPanel user={user} />
      )}
    </Layout>
  )
}
