import React from 'react'

function Homepage({ gameModes, onStartGame }) {
  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 bg-gradient-to-b from-[#0b0f14] to-[#131a24]">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 gradient-title">
          🏗️ FlashPoint
        </h1>
        <p className="text-xl text-[#9fb0cc]">
          Build the tallest tower. Outsmart the market.
        </p>
      </div>

      {/* Game Modes Section */}
      <div className="w-full max-w-4xl mb-12">
        <h2 className="text-center text-2xl font-semibold mb-6 text-[#e6eef8]">
          Select Game Mode
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
              <div className="flex gap-4 mb-5">
                {mode.rules?.session_duration && (
                  <span className="text-xs text-[#6ea0d6]">
                    ⏱️ {mode.rules.session_duration}s
                  </span>
                )}
                {mode.spawner?.allowed_blocks && (
                  <span className="text-xs text-[#6ea0d6]">
                    🧱 {mode.spawner.allowed_blocks.length} block types
                  </span>
                )}
              </div>
              <button 
                className="w-full py-3 px-6 text-base font-semibold text-white rounded-lg cursor-pointer transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 gradient-button"
                onClick={() => onStartGame(mode.id)}
              >
                Start Game
              </button>
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
            <li>Drag and drop blocks to build your tower</li>
            <li>Stack blocks as high as possible</li>
            <li>Complete level objectives before time runs out</li>
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
