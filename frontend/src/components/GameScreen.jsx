import React, { useRef, useCallback } from 'react'
import { useGameConfig } from '../hooks/useGameConfig'
import { useGameEngine } from '../hooks/useGameEngine'
import { useGameSession } from '../hooks/useGameSession'
import { useMultiplayer } from '../hooks/useMultiplayer'
import { 
  GameCanvas, 
  GameControls, 
  GameHeader, 
  GameResult, 
  SessionTimer, 
  TurnIndicator 
} from './game'

/**
 * Main game screen component
 * Orchestrates all game hooks and renders the game UI
 */
function GameScreen({ activeMode, onBackToHome }) {
  const sceneRef = useRef(null)
  
  // Load game configuration
  const { blockLibrary, strategyConfig, levelsConfig, isLoading, error } = useGameConfig()
  
  // Determine if this is multiplayer mode
  const isMultiplayer = activeMode.key === 'collaborative_stacking'
  
  // Calculate max blocks from level config
  const currentLevel = levelsConfig?.levels?.[0]
  const maxBlocks = currentLevel?.blocks_to_place || null
  
  // Initialize game engine
  const {
    engineRef,
    renderRef,
    bodiesRef,
    groundRef,
    spawnedBlocks,
    setSpawnedBlocks,
    draggedBody,
    setDraggedBody,
    spawnBlock: engineSpawnBlock,
    clearBlocks,
    isReady: engineReady
  } = useGameEngine({
    sceneRef,
    blockLibrary,
    isLoading,
    activeMode,
    onBlockPositionChange: null // Will be set by multiplayer hook
  })
  
  // Initialize multiplayer handling
  const {
    isMyTurn,
    setIsMyTurn,
    turnCount,
    setTurnCount,
    partnerAddress,
    playerNumber,
    syncBlockPosition,
    handleSpawnBlock: multiplayerSpawnBlock,
    handleEndTurn: multiplayerEndTurn
  } = useMultiplayer({
    isMultiplayer,
    activeMode,
    engineSpawnBlock,
    blockLibrary,
    bodiesRef
  })
  
  // Initialize session timer and game result handling
  const {
    sessionTime,
    gameResult,
    isTimeUp,
    handleGameEnd
  } = useGameSession({
    activeMode,
    turnCount,
    spawnedBlocks,
    currentLevel,
    bodiesRef,
    groundRef,
    engineRef
  })
  
  // Handle spawning a block
  const handleSpawnBlock = useCallback(() => {
    if (!isMyTurn) return
    if (maxBlocks && spawnedBlocks >= maxBlocks) return
    
    const newBlock = multiplayerSpawnBlock()
    if (newBlock) {
      setSpawnedBlocks(prev => prev + 1)
    }
  }, [isMyTurn, maxBlocks, spawnedBlocks, multiplayerSpawnBlock, setSpawnedBlocks])
  
  // Handle ending turn
  const handleEndTurn = useCallback(() => {
    if (!isMyTurn) return
    multiplayerEndTurn()
  }, [isMyTurn, multiplayerEndTurn])
  
  // Handle back to home
  const handleBackToHome = useCallback(() => {
    clearBlocks()
    onBackToHome()
  }, [clearBlocks, onBackToHome])
  
  // Loading state
  if (isLoading) {
    return (
      <section className='w-full min-h-screen flex justify-center items-center flex-col text-center p-8 bg-[#0a1020]'>
        <div className='text-[#9fb0cc]'>Loading game...</div>
      </section>
    )
  }
  
  // Error state
  if (error) {
    return (
      <section className='w-full min-h-screen flex justify-center items-center flex-col text-center p-8 bg-[#0a1020]'>
        <div className='text-red-400'>Error loading game: {error}</div>
        <button 
          className='mt-4 px-4 py-2 bg-white/10 rounded-md text-white'
          onClick={onBackToHome}
        >
          ← Back to Menu
        </button>
      </section>
    )
  }

  return (
    <section className='w-full min-h-screen flex justify-center items-center flex-col text-center p-8 bg-[#0a1020]'>
      <GameHeader activeMode={activeMode} onBackToHome={handleBackToHome} />
      
      <SessionTimer sessionTime={sessionTime} />
      
      {gameResult ? (
        <GameResult gameResult={gameResult} onBackToHome={handleBackToHome} />
      ) : (
        <>
          <TurnIndicator 
            isMultiplayer={isMultiplayer}
            isMyTurn={isMyTurn}
            playerNumber={playerNumber}
            partnerAddress={partnerAddress}
            turnCount={turnCount}
          />
          
          <GameControls 
            isMyTurn={isMyTurn}
            isTimeUp={isTimeUp}
            isMultiplayer={isMultiplayer}
            spawnedBlocks={spawnedBlocks}
            maxBlocks={maxBlocks}
            onSpawnBlock={handleSpawnBlock}
            onEndTurn={handleEndTurn}
          />
        </>
      )}
      
      <GameCanvas ref={sceneRef} />
    </section>
  )
}

export default GameScreen
