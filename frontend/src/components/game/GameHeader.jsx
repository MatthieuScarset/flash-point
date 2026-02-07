import React from 'react'

/**
 * Game header with mode info and back button
 */
function GameHeader({ activeMode, onBackToHome }) {
  return (
    <>
      <button 
        className='px-4 py-2 mb-8 text-sm text-[#9fb0cc] bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all duration-150 hover:bg-white/10 hover:text-[#e6eef8]' 
        onClick={onBackToHome}
      >
        ← Back to Menu
      </button>
      <h1 className='text-2xl font-bold text-[#e6eef8] mb-2'>{activeMode.name}</h1>
      <p className='text-sm text-[#9fb0cc] mb-4'>{activeMode.description}</p>
    </>
  )
}

export default GameHeader
