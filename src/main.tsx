import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App'
import { redactAnalyticsEvent } from './lib/analytics'
import { getShareCodeFromPath, prefetchAlbum } from './lib/gallery'

// Activate preloaded Google Fonts stylesheet without render-blocking initial paint or violating CSP.
const fontLink = document.getElementById('google-fonts-preload')
if (fontLink instanceof HTMLLinkElement) {
  fontLink.rel = 'stylesheet'
}

// Start fetching the album manifest immediately in parallel with React boot.
const initialShareCode = getShareCodeFromPath(window.location.pathname)
if (initialShareCode) {
  prefetchAlbum(initialShareCode)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={redactAnalyticsEvent} />
  </StrictMode>,
)
