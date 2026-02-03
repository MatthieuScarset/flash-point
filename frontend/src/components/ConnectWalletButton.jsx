import * as React from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'

function ConnectWalletButton() {
  const { connectors, connect, status, error } = useConnect()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  // Format address for display
  const formatAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#9fb0cc]">{formatAddress(address)}</span>
        <button 
          className="bg-red-500 text-white font-bold py-2 px-4 rounded-full hover:bg-red-700"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    )
  }

  const connector = connectors[0]
  const isLoading = status === 'pending'
  const hasError = status === 'error'

  // Check if there's an injected wallet available
  const hasWallet = connector && typeof window !== 'undefined' && window.ethereum

  return (
    <div className="flex flex-col items-end gap-2">
      <button 
        className={`text-white font-bold py-2 px-4 rounded-full mb-4 ${
          isLoading 
            ? 'bg-gray-500 cursor-wait' 
            : hasWallet 
              ? 'bg-blue-500 hover:bg-blue-700' 
              : 'bg-orange-500 hover:bg-orange-600'
        }`}
        onClick={() => {
          if (!hasWallet) {
            window.open('https://metamask.io/download/', '_blank')
          } else {
            connect({ connector })
          }
        }}
        disabled={isLoading}
      >
        {isLoading ? 'Connecting...' : hasWallet ? 'Connect Wallet' : 'Install MetaMask'}
      </button>
      {hasError && error && (
        <p className="text-xs text-red-400 max-w-[200px] text-right">
          {error.message || 'Connection failed. Please try again.'}
        </p>
      )}
    </div>
  )
}

export default ConnectWalletButton
