import { useState, useEffect, useCallback, useRef } from 'react'
import { matchmaking } from '../services/matchmaking'

/**
 * Hook to manage multiplayer/turn-based game state
 */
export const useMultiplayer = (
  isMultiplayer,
  gameData,
  gameConfig,
  engine,
  getBlockStates,
  applyBlockStates,
  setMouseEnabled,
  spawnBlockFn
) => {
  const [isMyTurn, setIsMyTurn] = useState(true)
  const [playerNumber, setPlayerNumber] = useState(null)
  const [partnerAddress, setPartnerAddress] = useState(null)
  const [turnCount, setTurnCount] = useState(0)
  const [spawnedBlocks, setSpawnedBlocks] = useState(0)
  const blockBodiesRef = useRef(new Map())

  // Initialize multiplayer state
  useEffect(() => {
    if (isMultiplayer && gameData) {
      setPlayerNumber(gameData.playerNumber)
      setIsMyTurn(gameData.isYourTurn)
      setPartnerAddress(gameData.opponent?.address)
    } else {
      // Training mode
      setPlayerNumber(1)
      setIsMyTurn(true)
      setPartnerAddress(null)
    }
    setTurnCount(0)
    setSpawnedBlocks(0)
    blockBodiesRef.current.clear()
  }, [isMultiplayer, gameData])

  // Enable/disable mouse based on turn
  useEffect(() => {
    setMouseEnabled(isMyTurn)
  }, [isMyTurn, setMouseEnabled])

  // Multiplayer event handlers
  useEffect(() => {
    if (!isMultiplayer) return

    const handleTurnChanged = (data) => {
      setIsMyTurn(data.isYourTurn)
      setTurnCount(data.turnCount)
      
      if (data.blockStates) {
        applyBlockStates(data.blockStates)
      }
    }

    const handleBlockSpawned = (data) => {
      if (data.spawnedBy !== playerNumber && gameConfig) {
        const blockConfig = gameConfig.block_library[data.block.label]
        if (blockConfig && spawnBlockFn) {
          const body = spawnBlockFn(blockConfig, { x: data.block.x, y: data.block.y })
          if (body) {
            body.id = data.block.id
            blockBodiesRef.current.set(data.block.id, body)
          }
        }
      }
      setSpawnedBlocks(data.totalBlocks)
    }

    const handleBlockPositionUpdate = (data) => {
      // This will be handled by the engine directly
    }

    const handleGameStateSync = (data) => {
      if (data.blockStates) {
        applyBlockStates(data.blockStates)
      }
    }

    matchmaking.on('turn_changed', handleTurnChanged)
    matchmaking.on('block_spawned', handleBlockSpawned)
    matchmaking.on('block_position_update', handleBlockPositionUpdate)
    matchmaking.on('game_state_sync', handleGameStateSync)

    return () => {
      matchmaking.off('turn_changed', handleTurnChanged)
      matchmaking.off('block_spawned', handleBlockSpawned)
      matchmaking.off('block_position_update', handleBlockPositionUpdate)
      matchmaking.off('game_state_sync', handleGameStateSync)
    }
  }, [isMultiplayer, playerNumber, gameConfig, applyBlockStates, spawnBlockFn])

  // End turn
  const endTurn = useCallback(() => {
    if (!isMyTurn) return

    if (isMultiplayer) {
      const blockStates = getBlockStates()
      matchmaking.endTurn(blockStates)
      setIsMyTurn(false)
    } else {
      // Training mode: simulate turn switch
      setIsMyTurn(false)
      setTurnCount(prev => prev + 1)
      
      setTimeout(() => {
        setTurnCount(prev => prev + 1)
        setIsMyTurn(true)
      }, 1000)
    }
  }, [isMyTurn, isMultiplayer, getBlockStates])

  // Spawn block (handles multiplayer sync)
  const handleSpawnBlock = useCallback((blockConfig, position) => {
    if (!isMyTurn) return null

    const block = spawnBlockFn(blockConfig, position)
    if (!block) return null

    blockBodiesRef.current.set(block.id, block)

    if (isMultiplayer) {
      matchmaking.spawnBlock({
        id: block.id,
        label: blockConfig.label,
        x: position.x,
        y: position.y
      })
    } else {
      setSpawnedBlocks(prev => prev + 1)
    }

    return block
  }, [isMyTurn, isMultiplayer, spawnBlockFn])

  // Sync dragged block position
  const syncDragPosition = useCallback((draggedBody) => {
    if (!isMultiplayer || !draggedBody || !isMyTurn) return

    matchmaking.syncBlockPosition(
      draggedBody.id,
      draggedBody.position.x,
      draggedBody.position.y,
      draggedBody.angle
    )
  }, [isMultiplayer, isMyTurn])

  // Reset state
  const reset = useCallback(() => {
    setIsMyTurn(true)
    setPlayerNumber(null)
    setPartnerAddress(null)
    setTurnCount(0)
    setSpawnedBlocks(0)
    blockBodiesRef.current.clear()
    
    if (isMultiplayer) {
      matchmaking.disconnect()
    }
  }, [isMultiplayer])

  return {
    isMyTurn,
    playerNumber,
    partnerAddress,
    turnCount,
    spawnedBlocks,
    endTurn,
    handleSpawnBlock,
    syncDragPosition,
    reset
  }
}

export default useMultiplayer
