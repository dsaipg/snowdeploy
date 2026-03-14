import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Global reset / animations
const style = document.createElement('style')
style.textContent = `
  @keyframes spin  { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
  input:focus, select:focus, textarea:focus { border-color: #2563eb !important; }
`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
