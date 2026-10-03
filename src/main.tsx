import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'

Sentry.init({
  dsn: 'https://455d42625d7fe9db0e13d6f8a25883cc@o4512194350022656.ingest.de.sentry.io/4512194375581776',
  environment: import.meta.env.MODE,
  sendDefaultPii: false,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
