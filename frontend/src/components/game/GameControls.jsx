import React from 'react'

/**
 * Game controls component (spawn block, end turn)
 */
function GameControls({ 
  isMyTurn, 
  isTimeUp, 
  isMultiplayer,
  spawnedBlocks, 
  maxBlocks, 
  onSpawnBlock, 
  onEndTurn 
}) {
  if (isTimeUp) return null

  const remaining = maxBlocks ? maxBlocks - spawnedBlocks : null
  const isNotMyTurn = !isMyTurn
  const isMaxBlocksReached = maxBlocks && spawnedBlocks >= maxBlocks
  const isSpawnDisabled = isNotMyTurn || isMaxBlocksReached

  const getSpawnButtonText = () => {
    if (isNotMyTurn) {
      return isMultiplayer ? 'Wait for Partner' : 'Wait...'
    }
    return `Spawn Block${remaining !== null ? ` (${remaining})` : ''}`
  }

  return (
    <div className='flex gap-2 items-center justify-center flex-wrap'>
      <button 
        className={`px-4 py-2 text-sm font-medium text-[#e6eef8] rounded-md cursor-pointer transition-all duration-150 ${
          isSpawnDisabled 
            ? 'bg-gray-500/50 cursor-not-allowed' 
            : 'bg-[#6D28D9]/80 hover:bg-[#6D28D9]'
        }`}
        onClick={onSpawnBlock}
        disabled={isSpawnDisabled}
      >
        {getSpawnButtonText()}
      </button>
      
      {isMyTurn && (
        <button 
          className='px-6 py-3 text-base font-bold text-white rounded-lg cursor-pointer transition-all duration-150 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-lg hover:shadow-green-500/25 hover:-translate-y-0.5'
          onClick={onEndTurn}
        >
          ✅ END TURN
        </button>
      )}
    </div>
  )
}

export default GameControls
