import React from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet, polygon, arbitrum, optimism, base, baseSepolia, sepolia, polygonAmoy } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { injected } from 'wagmi/connectors'

// Yellow Network supported chains
// Sandbox (Testnet): Base Sepolia (84532), Polygon Amoy (80002), ETH Sepolia (11155111)
// Production: Base (8453), Polygon (137), Ethereum (1)
// See: https://docs.yellow.org/docs/learn/introduction/supported-chains

// Create wagmi config with Yellow Network supported chains
const config = createConfig({
  chains: [sepolia, baseSepolia, polygonAmoy, base, mainnet, polygon, arbitrum, optimism],
  connectors: [
    injected(),
  ],
  transports: {
    // Yellow Network Sandbox (Testnet)
    [sepolia.id]: http(),        // ETH Sepolia - chain 11155111
    [baseSepolia.id]: http(),    // Base Sepolia - chain 84532
    [polygonAmoy.id]: http(),    // Polygon Amoy - chain 80002
    // Yellow Network Production (Mainnet)
    [base.id]: http(),           // Base Mainnet
    [mainnet.id]: http(),        // Ethereum Mainnet
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
