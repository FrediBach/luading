import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installDevelopmentPerformanceCleanup } from './development-performance'
import './index.css'
import App from './App.tsx'

const stopPerformanceCleanup = import.meta.env.DEV
  ? installDevelopmentPerformanceCleanup(window)
  : undefined

if (stopPerformanceCleanup) {
  import.meta.hot?.dispose(stopPerformanceCleanup)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
