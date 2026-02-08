import * as React from 'react'
import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useEnsName, useEnsAvatar, useChainId } from 'wagmi'

// ENS app URLs per network
const ENS_APP_URLS = {
  1: 'https://app.ens.domains',
  11155111: 'https://sepolia.app.ens.domains',
}

function ConnectWalletButton() {
  const { connectors, connect, status, error } = useConnect()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  
  // Fetch ENS name and avatar
  const { data: ensName, isLoading: ensNameLoading } = useEnsName({ 
    address,
    chainId: chainId === 11155111 ? 11155111 : 1, // Use Sepolia or Mainnet for ENS
  })
  const { data: ensAvatar, isLoading: ensAvatarLoading } = useEnsAvatar({ 
    name: ensName,
    chainId: chainId === 11155111 ? 11155111 : 1,
  })

  const [showDropdown, setShowDropdown] = useState(false)
  
  const ensAppUrl = ENS_APP_URLS[chainId] || ENS_APP_URLS[11155111]
  const isTestnet = chainId !== 1

  // Format address for display
  const formatAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showDropdown && !e.target.closest('.wallet-dropdown')) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showDropdown])

  if (isConnected) {
    return (
      <div className="relative wallet-dropdown">
        {/* User Profile Button */}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full py-2 px-3 transition-all duration-200"
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            {ensAvatarLoading ? (
              <div className="w-full h-full bg-white/20 animate-pulse"></div>
            ) : ensAvatar ? (
              <img src={ensAvatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-sm font-bold">
                {(ensName || address)?.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          
          {/* Name/Address */}
          <div className="text-left">
            {ensNameLoading ? (
              <div className="h-4 w-20 bg-white/20 rounded animate-pulse"></div>
            ) : ensName ? (
              <>
                <p className="text-sm font-medium text-white">{ensName}</p>
                <p className="text-xs text-[#6ea0d6]">{formatAddress(address)}</p>
              </>
            ) : (
              <p className="text-sm text-[#9fb0cc]">{formatAddress(address)}</p>
            )}
          </div>

          {/* Dropdown Arrow */}
          <svg 
            className={`w-4 h-4 text-[#9fb0cc] transition-transform ${showDropdown ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {showDropdown && (
          <div className="absolute right-0 mt-2 w-64 bg-[#1a2030] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
            {/* Profile Header */}
            <div className="p-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  {ensAvatar ? (
                    <img src={ensAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-lg font-bold">
                      {(ensName || address)?.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  {ensName ? (
                    <>
                      <p className="font-semibold text-white">{ensName}</p>
                      <p className="text-xs text-[#6ea0d6]">{formatAddress(address)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-white">{formatAddress(address)}</p>
                      <p className="text-xs text-yellow-400">No ENS name</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="p-2">
              {/* Network Badge */}
              <div className="px-3 py-2 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isTestnet ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
                <span className="text-xs text-[#9fb0cc]">
                  {chainId === 11155111 ? 'Sepolia Testnet' : chainId === 1 ? 'Ethereum Mainnet' : `Chain ${chainId}`}
                </span>
              </div>

              {/* ENS Profile Link */}
              {ensName ? (
                <a
                  href={`${ensAppUrl}/${ensName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg">😜</span>
                  <span className="text-sm text-[#e6eef8]">View ENS Profile</span>
                  <svg className="w-4 h-4 text-[#6ea0d6] ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : (
                <a
                  href={ensAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg">✨</span>
                  <span className="text-sm text-yellow-400">Get an ENS name</span>
                  <svg className="w-4 h-4 text-[#6ea0d6] ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}

              {/* Copy Address */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(address)
                  // Could add a toast notification here
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-lg">📋</span>
                <span className="text-sm text-[#e6eef8]">Copy Address</span>
              </button>

              {/* Etherscan Link */}
              <a
                href={`https://${isTestnet ? 'sepolia.' : ''}etherscan.io/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-lg">🔍</span>
                <span className="text-sm text-[#e6eef8]">View on Etherscan</span>
                <svg className="w-4 h-4 text-[#6ea0d6] ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>

              {/* Divider */}
              <div className="my-2 border-t border-white/10"></div>

              {/* Disconnect */}
              <button
                onClick={() => {
                  disconnect()
                  setShowDropdown(false)
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
              >
                <span className="text-lg">🚪</span>
                <span className="text-sm">Disconnect</span>
              </button>
            </div>
          </div>
        )}
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
        className={`flex items-center gap-2 font-bold py-2 px-5 rounded-full transition-all duration-200 ${
          isLoading 
            ? 'bg-gray-500 cursor-wait text-white' 
            : hasWallet 
              ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400 text-white' 
              : 'bg-orange-500 hover:bg-orange-600 text-white'
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
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Connecting...
          </>
        ) : hasWallet ? (
          <>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
            Connect Wallet
          </>
        ) : (
          <>
            🦊 Install MetaMask
          </>
        )}
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
