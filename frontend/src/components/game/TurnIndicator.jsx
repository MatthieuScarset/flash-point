import React from 'react'

/**
 * Turn indicator component for both multiplayer and training modes
 */
function TurnIndicator({ 
  isMultiplayer, 
  isMyTurn, 
  playerNumber, 
  partnerAddress, 
  turnCount 
}) {
  if (isMultiplayer) {
    return (
      <div className='mb-4 p-3 bg-white/5 border border-white/10 rounded-lg'>
        <div className='flex items-center justify-center gap-4 text-sm'>
          <span className='text-[#9fb0cc]'>
            👥 Playing with: <span className='text-[#6ea0d6] font-mono'>
              {partnerAddress ? `${partnerAddress.slice(0, 6)}...${partnerAddress.slice(-4)}` : 'Partner'}
            </span>
          </span>
          <span className='text-[#9fb0cc]'>
            You are Player {playerNumber}
          </span>
        </div>
        <div className={`mt-2 text-lg font-bold ${isMyTurn ? 'text-green-400' : 'text-yellow-400'}`}>
          {isMyTurn ? '🎯 Your Turn!' : '⏳ Partner\'s Turn...'}
        </div>
        {turnCount > 0 && (
          <div className='text-xs text-[#9fb0cc] mt-1'>Turn #{turnCount + 1}</div>
        )}
      </div>
    )
  }

  // Training mode
  return (
    <div className='mb-4 p-3 bg-white/5 border border-white/10 rounded-lg'>
      <div className='text-sm text-[#9fb0cc] mb-1'>
        🎓 Training Mode — Practice like it's the real thing!
      </div>
      <div className={`text-lg font-bold ${isMyTurn ? 'text-green-400' : 'text-yellow-400'}`}>
        {isMyTurn ? '🎯 Your Turn!' : '⏳ Simulating partner...'}
      </div>
      <div className='text-xs text-[#9fb0cc] mt-1'>Turn #{Math.floor(turnCount / 2) + 1}</div>
    </div>
  )
}

export default TurnIndicator
