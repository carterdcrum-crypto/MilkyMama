import React from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './AppNext.jsx'
import './styles.css'
import './reminders.css'
import './features.css'
import './native-bootstrap.js'

const native = Capacitor.isNativePlatform()

if (!native) {
  import('./push-client.js')

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${import.meta.env.BASE_URL}sw.js`
      navigator.serviceWorker.register(swUrl).catch(() => {})
    })
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
