import React, { useState, useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient, useChainId } from 'wagmi'
import ConnectWalletButton from './ConnectWalletButton'
import { ensGameHistory } from '../services/ensGameHistory'

// ENS app URLs per network
const ENS_APP_URLS = {
  1: 'https://app.ens.domains',           // Mainnet
  11155111: 'https://sepolia.app.ens.domains', // Sepolia
}

function Homepage({ gameModes, onStartGame, onStartMultiplayer }) {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  
  const [ensName, setEnsName] = useState(null)
  const [gameHistory, setGameHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Get ENS URL based on current network
  const ensAppUrl = ENS_APP_URLS[chainId] || ENS_APP_URLS[11155111] // Default to Sepolia for testnets
  const isTestnet = chainId !== 1

  // Load ENS name and game history when connected
  useEffect(() => {
    if (publicClient && walletClient && address) {
      ensGameHistory.initialize(publicClient, walletClient)
      
      // Get ENS name
      ensGameHistory.getENSName(address).then(name => {
        if (name) {
          setEnsName(name)
          console.log('😜 ENS name found:', name)
          
          // Load game history from ENS
          setLoadingHistory(true)
          ensGameHistory.getGameHistory(name).then(history => {
            setGameHistory(history || [])
            setLoadingHistory(false)
          }).catch(() => setLoadingHistory(false))
        }
      })
    } else {
      setEnsName(null)
      setGameHistory([])
    }
  }, [publicClient, walletClient, address])
  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 bg-gradient-to-b from-[#0b0f14] to-[#131a24]">
      {/* Header with Wallet */}
      <div className="w-full max-w-4xl flex justify-end mb-4">
        <ConnectWalletButton />
      </div>

      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 gradient-title">
          🏗️ FlashPoint
        </h1>
        <p className="text-xl text-[#9fb0cc]">
          Build together. Stack higher. Have fun!
        </p>
      </div>

      {/* Game Modes Section */}
      <div className="w-full max-w-4xl mb-12">
        <h2 className="text-center text-2xl font-semibold mb-6 text-[#e6eef8]">
          Select Game Mode
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {gameModes && gameModes.map((mode) => (
            <div 
              key={mode.id} 
              className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#4A90E2]/40"
            >
              <h3 className="text-xl font-semibold mb-3 text-[#e6eef8]">
                {mode.name}
              </h3>
              <p className="text-sm text-[#9fb0cc] leading-relaxed mb-4">
                {mode.description}
              </p>
              <div className="flex flex-wrap gap-3 mb-5">
                {mode.player_count && (
                  <span className="text-xs text-[#6ea0d6]">
                    👥 {mode.player_count} player{mode.player_count > 1 ? 's' : ''}
                  </span>
                )}
                {mode.turn_based && (
                  <span className="text-xs text-[#6ea0d6]">
                    🔄 Turn-based
                  </span>
                )}
                {mode.rules?.session_duration && (
                  <span className="text-xs text-[#6ea0d6]">
                    ⏱️ {mode.rules.session_duration}s
                  </span>
                )}
                {mode.spawner?.max_blocks && (
                  <span className="text-xs text-[#6ea0d6]">
                    📦 {mode.spawner.max_blocks} blocks
                  </span>
                )}
              </div>
              {mode.multiplayer ? (
                <button 
                  className={`w-full py-3 px-6 my-2 text-base font-semibold text-white rounded-lg transition-all duration-150 ${
                    isConnected 
                      ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400' 
                      : 'bg-gray-600 cursor-not-allowed opacity-50'
                  }`}
                  onClick={() => isConnected && onStartMultiplayer(mode.id, mode.name)}
                  disabled={!isConnected}
                  title={!isConnected ? 'Connect wallet to find a partner' : 'Find a partner to build together!'}
                >
                  {isConnected ? '👥 Find Partner (1 USDC)' : '🔒 Connect Wallet'}
                </button>
              ) : (
                <button 
                  className="w-full py-3 px-6 my-2 text-base font-semibold text-white rounded-lg cursor-pointer transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 bg-[#2a3040] hover:bg-[#353d50] border border-white/10"
                  onClick={() => onStartGame(mode.id)}
                >
                  🎯 Start Training
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Info Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-4xl mb-12">
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 text-[#e6eef8]">
            🎯 How to Play
          </h3>
          <ul className="pl-5 text-[#9fb0cc] leading-loose list-disc">
            <li><strong>Training:</strong> Practice solo, no pressure!</li>
            <li><strong>Collaborative:</strong> Take turns with a partner</li>
            <li>Drag and drop blocks to build your tower</li>
            <li>Stack as high as possible before time runs out</li>
          </ul>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 text-[#e6eef8]">
            🧱 Block Types
          </h3>
          <ul className="pl-5 text-[#9fb0cc] leading-loose list-disc">
            <li><span className="text-block-stable">●</span> Stable Hex — High friction, easy to stack</li>
            <li><span className="text-block-volatile">●</span> Volatile Hex — Bouncy, harder to control</li>
            <li><span className="text-block-heavy">●</span> Heavy Square — Massive, great foundation</li>
          </ul>
        </div>
      </div>

      {/* ENS Profile & Game History Section */}
      {isConnected && (
        <div className="w-full max-w-4xl mb-12">
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#e6eef8] flex items-center gap-2">
                😜 Your Profile
              </h3>
              {ensName ? (
                <a
                  href={`${ensAppUrl}/${ensName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  {ensName}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : (
                <a
                  href={ensAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                >
                  Get your .eth name {isTestnet ? '(Sepolia)' : ''} →
                </a>
              )}
            </div>

            {ensName ? (
              <>
                {/* Game History */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-[#9fb0cc]">
                      🎮 Game History (stored on-chain via ENS)
                    </p>
                    <a
                      href={`${ensAppUrl}/${ensName}?tab=records`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      View on ENS →
                    </a>
                  </div>
                  
                  {loadingHistory ? (
                    <div className="text-center py-4">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                      <p className="text-xs text-[#6ea0d6] mt-2">Loading history...</p>
                    </div>
                  ) : gameHistory.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {gameHistory.slice(0, 5).map((game, i) => (
                        <div key={i} className="bg-black/20 rounded-lg p-3 flex justify-between items-center">
                          <div>
                            <p className="text-sm text-white">
                              🏗️ {game.h || 0}px tower
                              <span className="text-xs text-[#9fb0cc] ml-2">
                                ({game.b || 0} blocks, {game.t || 0} turns)
                              </span>
                            </p>
                            <p className="text-xs text-[#6ea0d6]">
                              {game.ts ? new Date(game.ts * 1000).toLocaleDateString() : 'Unknown date'}
                              {game.w && ` • Partner: ${game.w}...`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-green-400">
                              ${((parseInt(game.p) || 0) / 1_000_000).toFixed(2)}
                            </p>
                            <p className="text-xs text-[#9fb0cc]">{game.r || '✅'}</p>
                          </div>
                        </div>
                      ))}
                      {gameHistory.length > 5 && (
                        <p className="text-xs text-center text-[#6ea0d6]">
                          +{gameHistory.length - 5} more games
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 bg-black/20 rounded-lg">
                      <p className="text-[#9fb0cc] text-sm">No games recorded yet</p>
                      <p className="text-xs text-[#6ea0d6] mt-1">Play a collaborative game to start your history!</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-black/20 rounded-lg p-4">
                <p className="text-[#9fb0cc] text-sm mb-3">
                  Get an ENS name to save your game history on-chain!
                </p>
                <a
                  href={ensAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full block text-center py-2 px-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors"
                >
                  {isTestnet ? '🧪 Get .eth on Sepolia' : '🔗 Get .eth on Mainnet'}
                </a>
                <p className="text-xs text-[#6ea0d6] mt-3 text-center">
                  {isTestnet 
                    ? '💡 You\'re on Sepolia testnet - register a free test ENS name!'
                    : '💡 Switch to Sepolia for free test names, or register on mainnet'
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto pt-6">
        <a 
          href="https://github.com/MatthieuScarset/flash-point"
          className="text-[#6ea0d6] text-sm no-underline hover:underline"
        >
          🙈 View on GitHub
        </a>
      </footer>
    </div>
  )
}

export default Homepage
