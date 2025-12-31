import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { initConsoleOverride } from './utils/console'

// Disable console.log/debug/info in production
initConsoleOverride()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)



