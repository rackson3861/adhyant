import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AdminProvider } from './context/AdminContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AdminProvider>
      <App />
    </AdminProvider>
  </React.StrictMode>
)
