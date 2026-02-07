import React from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet, polygon, arbitrum, optimism, base, baseSepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { injected } from 'wagmi/connectors'

// Yellow Network supported chains
// Base Sepolia is recommended for testing
// See: https://docs.yellow.org/

// Create wagmi config with Yellow Network supported chains
const config = createConfig({
  chains: [baseSepolia, base, mainnet, polygon, arbitrum, optimism],
  connectors: [
    injected(),
  ],
  transports: {
    [baseSepolia.id]: http(), // Yellow Network Testnet
    [base.id]: http(),        // Yellow Network Mainnet
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
  },
})

// Create a query client
const queryClient = new QueryClient()

export function WalletProvider({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export { config }
