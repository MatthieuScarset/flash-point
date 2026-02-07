import React from 'react'
import { getResultMessage } from '../../utils/gameUtils'

/**
 * Game result display component
 */
function GameResult({ gameResult, onBackToHome }) {
  if (!gameResult) return null

  return (
    <div className='mb-6 p-6 bg-gradient-to-b from-white/10 to-white/5 border border-white/20 rounded-xl'>
      <div className='text-2xl font-bold text-white mb-4'>
        {getResultMessage(gameResult.status)}
      </div>
      
      <div className='grid grid-cols-2 gap-4 mb-4'>
        <div className='bg-white/5 rounded-lg p-3'>
          <div className='text-xs text-[#9fb0cc] uppercase'>Tower Height</div>
          <div className='text-3xl font-bold text-[#6ea0d6]'>{gameResult.towerHeight}px</div>
        </div>
        <div className='bg-white/5 rounded-lg p-3'>
          <div className='text-xs text-[#9fb0cc] uppercase'>Blocks Placed</div>
          <div className='text-3xl font-bold text-[#6ea0d6]'>{gameResult.totalBlocks}</div>
        </div>
      </div>
      
      <div className='text-sm text-[#9fb0cc] mb-4'>
        Completed in {gameResult.turnsPlayed} turn{gameResult.turnsPlayed !== 1 ? 's' : ''}
      </div>
      
      {gameResult.targetBlocks && (
        <div className={`text-sm ${gameResult.status === 'won' ? 'text-green-400' : 'text-yellow-400'}`}>
          Target: {gameResult.totalBlocks}/{gameResult.targetBlocks} blocks
        </div>
      )}
      
      <button 
        className='mt-4 px-6 py-3 text-base font-bold text-white rounded-lg cursor-pointer transition-all duration-150 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500'
        onClick={onBackToHome}
      >
        🏠 Back to Menu
      </button>
    </div>
  )
}

export default GameResult
