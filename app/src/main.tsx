import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TenderWindow } from './TenderWindow'
import './app.css'

const root = document.getElementById('root')
const bid = new URLSearchParams(window.location.search).get('bid')
if (root) createRoot(root).render(
  <StrictMode>
    {bid ? <TenderWindow bidNumber={bid} /> : <App />}
  </StrictMode>,
)
