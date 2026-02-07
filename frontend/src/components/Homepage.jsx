import React from 'react'
import { useAccount } from 'wagmi'
import ConnectWalletButton from './ConnectWalletButton'

function Homepage({ gameModes, onStartGame, onStartMultiplayer }) {
  const { isConnected } = useAccount()
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
