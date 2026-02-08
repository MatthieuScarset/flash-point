import React, { useState } from 'react'
import { useAccount } from 'wagmi'
import { getResultMessage } from '../../utils/gameUtils'
import GameSettlement from './GameSettlement'

/**
 * Game result display component with Yellow Network settlement
 */
function GameResult({ 
  gameResult, 
  onBackToHome,
  sessionId = null,
  opponentAddress = null,
  betAmount = null,
  playerNumber = 1, // Which player number (1 can settle, 2 waits)
}) {
  const { address } = useAccount()
  const [isSettled, setIsSettled] = useState(false)
  
  if (!gameResult) return null

  // For settlement, we need the actual player addresses in order
  // Player 1 submitted the session, so they're the "settler"
  const player1Addr = playerNumber === 1 ? address : opponentAddress
  const player2Addr = playerNumber === 1 ? opponentAddress : address

  const handleSettlementComplete = (result) => {
    console.log('Settlement complete:', result)
    setIsSettled(true)
  }

  const handleSkipSettlement = () => {
    setIsSettled(true)
  }

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
        <div className={`text-sm ${gameResult.status === 'won' ? 'text-green-400' : 'text-yellow-400'} mb-4`}>
          Target: {gameResult.totalBlocks}/{gameResult.targetBlocks} blocks
        </div>
      )}

      {/* Yellow Network Settlement */}
      {!isSettled && (
        <GameSettlement
          gameResult={gameResult}
          sessionId={sessionId}
          player1Address={player1Addr}
          player2Address={player2Addr}
          playerNumber={playerNumber}
          betAmount={betAmount}
          onSettlementComplete={handleSettlementComplete}
          onSkip={handleSkipSettlement}
        />
      )}
      
      {/* Back to Menu Button - show after settlement or if no session */}
      {(isSettled || !sessionId) && (
        <button 
          className='mt-4 w-full px-6 py-3 text-base font-bold text-white rounded-lg cursor-pointer transition-all duration-150 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500'
          onClick={onBackToHome}
        >
          🏠 Back to Menu
        </button>
      )}
    </div>
  )
}

export default GameResult
