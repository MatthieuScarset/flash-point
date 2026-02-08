import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { WalletProvider } from './providers/WalletProvider'
import { YellowNetworkProvider } from './providers/YellowNetworkProvider'
import './style.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WalletProvider>
      <YellowNetworkProvider>
        <App />
      </YellowNetworkProvider>
    </WalletProvider>
  </React.StrictMode>
)
