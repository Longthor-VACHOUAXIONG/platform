import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import './i18n'
import App from './App.tsx'

// Error tracking — enabled only when VITE_SENTRY_DSN is set (create a Sentry
// project and set the DSN in .env.local / the build env). Without a DSN this
// is a no-op.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
  })
}

const Root = () => (
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div>Something went wrong.</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
)

createRoot(document.getElementById('root')!).render(<Root />)
