/**
 * useYellowSession Hook
 * 
 * React hook for managing Yellow Network state channel sessions
 * Provides functionality for:
 * - Connecting to ClearNode
 * - Creating game sessions with bets
 * - Settling game results
 * - Managing session state
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useWalletClient, useAccount } from 'wagmi'
import { nitroliteClient, DEFAULT_BET_AMOUNT } from '../services/nitroliteClient'

/**
 * Session states
 */
export const SessionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  CREATING_SESSION: 'creating_session',
  SESSION_ACTIVE: 'session_active',
  SETTLING: 'settling',
  SETTLED: 'settled',
  ERROR: 'error',
}

/**
 * Hook for managing Yellow Network game sessions
 * @param {Object} options
 * @param {boolean} options.autoConnect - Auto-connect on mount
 * @returns {Object} Session management functions and state
 */
export function useYellowSession({ autoConnect = false } = {}) {
  const { address, isConnected: isWalletConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  
  // State
  const [sessionState, setSessionState] = useState(SessionState.DISCONNECTED)
  const [appSessionId, setAppSessionId] = useState(null)
  const [error, setError] = useState(null)
  const [settlementResult, setSettlementResult] = useState(null)
  
  // Track if we've initialized
  const initializedRef = useRef(false)

  /**
   * Initialize the Nitrolite client with wallet
   */
  const initializeClient = useCallback(async () => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected')
    }
    
    nitroliteClient.initialize(walletClient, address)
    return true
  }, [walletClient, address])

  /**
   * Connect to Yellow Network ClearNode
   */
  const connect = useCallback(async () => {
    try {
      setError(null)
      setSessionState(SessionState.CONNECTING)
      
      await initializeClient()
      await nitroliteClient.connect()
      
      setSessionState(SessionState.CONNECTED)
      return true
    } catch (err) {
      console.error('Failed to connect to ClearNode:', err)
      setError(err.message)
      setSessionState(SessionState.ERROR)
      return false
    }
  }, [initializeClient])

  /**
   * Disconnect from Yellow Network
   */
  const disconnect = useCallback(() => {
    nitroliteClient.disconnect()
    setSessionState(SessionState.DISCONNECTED)
    setAppSessionId(null)
    setSettlementResult(null)
  }, [])

  /**
   * Create a game session (state channel) for betting
   * @param {string} opponentAddress - Opponent's wallet address
   * @param {string} betAmount - Bet amount in USDC (6 decimals)
   * @returns {Promise<Object>} Session details
   */
  const createGameSession = useCallback(async (opponentAddress, betAmount = DEFAULT_BET_AMOUNT) => {
    try {
      setError(null)
      setSessionState(SessionState.CREATING_SESSION)
      
      // Ensure we're connected
      if (!nitroliteClient.isReady()) {
        await connect()
      }
      
      const session = await nitroliteClient.createGameSession(opponentAddress, betAmount)
      
      if (session?.appSessionId) {
        setAppSessionId(session.appSessionId)
        setSessionState(SessionState.SESSION_ACTIVE)
      }
      
      return session
    } catch (err) {
      console.error('Failed to create game session:', err)
      setError(err.message)
      setSessionState(SessionState.ERROR)
      throw err
    }
  }, [connect])

  /**
   * Settle the game session with final results
   * @param {Object} gameResult - Game result with scores and addresses
   * @param {string} betAmount - Original bet amount
   * @returns {Promise<Object>} Settlement result
   */
  const settleGame = useCallback(async (gameResult, betAmount = DEFAULT_BET_AMOUNT) => {
    try {
      setError(null)
      setSessionState(SessionState.SETTLING)
      
      const result = await nitroliteClient.settleGameSession(gameResult, betAmount)
      
      setSettlementResult(result)
      setSessionState(SessionState.SETTLED)
      setAppSessionId(null)
      
      return result
    } catch (err) {
      console.error('Failed to settle game:', err)
      setError(err.message)
      setSessionState(SessionState.ERROR)
      throw err
    }
  }, [])

  /**
   * Submit intermediate game state
   * @param {Object} gameState - Current game state
   */
  const submitGameState = useCallback(async (gameState) => {
    try {
      return await nitroliteClient.submitGameState(gameState)
    } catch (err) {
      console.error('Failed to submit game state:', err)
      // Don't set error state for non-critical state updates
      return null
    }
  }, [])

  /**
   * Reset session state for new game
   */
  const resetSession = useCallback(() => {
    setAppSessionId(null)
    setSettlementResult(null)
    setError(null)
    if (nitroliteClient.isReady()) {
      setSessionState(SessionState.CONNECTED)
    } else {
      setSessionState(SessionState.DISCONNECTED)
    }
  }, [])

  // Auto-connect when wallet is available
  useEffect(() => {
    if (autoConnect && isWalletConnected && walletClient && !initializedRef.current) {
      initializedRef.current = true
      connect()
    }
  }, [autoConnect, isWalletConnected, walletClient, connect])

  // Set up event handlers
  useEffect(() => {
    const handleDisconnect = () => {
      if (sessionState !== SessionState.DISCONNECTED) {
        setSessionState(SessionState.DISCONNECTED)
      }
    }

    const handleError = (err) => {
      setError(err?.message || 'Unknown error')
    }

    nitroliteClient.on('disconnected', handleDisconnect)
    nitroliteClient.on('error', handleError)

    return () => {
      nitroliteClient.off('disconnected', handleDisconnect)
      nitroliteClient.off('error', handleError)
    }
  }, [sessionState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect on unmount - other components might use the session
    }
  }, [])

  return {
    // State
    sessionState,
    appSessionId,
    error,
    settlementResult,
    isConnected: sessionState === SessionState.CONNECTED || sessionState === SessionState.SESSION_ACTIVE,
    isSessionActive: sessionState === SessionState.SESSION_ACTIVE,
    isSettling: sessionState === SessionState.SETTLING,
    isSettled: sessionState === SessionState.SETTLED,
    
    // Actions
    connect,
    disconnect,
    createGameSession,
    settleGame,
    submitGameState,
    resetSession,
    
    // Utils
    betAmount: DEFAULT_BET_AMOUNT,
    formatBetAmount: (amount = DEFAULT_BET_AMOUNT) => {
      return (parseInt(amount) / 1_000_000).toFixed(2)
    }
  }
}

export default useYellowSession
