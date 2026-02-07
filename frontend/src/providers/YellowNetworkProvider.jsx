import React, { createContext, useContext, useCallback, useState, useEffect } from 'react'
import { useWalletClient, useAccount } from 'wagmi'
import { nitroliteClient, DEFAULT_BET_AMOUNT } from '../services/nitroliteClient'

/**
 * Yellow Network Context
 * Provides global state and functions for Yellow Network integration
 */
const YellowNetworkContext = createContext(null)

/**
 * Yellow Network Provider
 * Wraps the application to provide Yellow Network state channel functionality
 */
export function YellowNetworkProvider({ children }) {
  const { address, isConnected: isWalletConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  
  // Session state
  const [activeSession, setActiveSession] = useState(null)
  const [sessionHistory, setSessionHistory] = useState([])

  /**
   * Connect to Yellow Network ClearNode
   */
  const connect = useCallback(async () => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected')
    }

    setIsConnecting(true)
    setConnectionError(null)

    try {
      nitroliteClient.initialize(walletClient, address)
      await nitroliteClient.connect()
      setIsConnected(true)
    } catch (error) {
      setConnectionError(error.message)
      throw error
    } finally {
      setIsConnecting(false)
    }
  }, [walletClient, address])

  /**
   * Disconnect from Yellow Network
   */
  const disconnect = useCallback(() => {
    nitroliteClient.disconnect()
    setIsConnected(false)
    setActiveSession(null)
  }, [])

  /**
   * Create a new game session
   */
  const createSession = useCallback(async (opponentAddress, betAmount = DEFAULT_BET_AMOUNT) => {
    if (!isConnected) {
      await connect()
    }

    const session = await nitroliteClient.createGameSession(opponentAddress, betAmount)
    
    if (session?.appSessionId) {
      setActiveSession({
        id: session.appSessionId,
        opponent: opponentAddress,
        betAmount,
        createdAt: Date.now(),
        status: 'active',
      })
    }

    return session
  }, [isConnected, connect])

  /**
   * Settle the current game session
   */
  const settleSession = useCallback(async (gameResult, betAmount = DEFAULT_BET_AMOUNT) => {
    if (!activeSession) {
      throw new Error('No active session to settle')
    }

    const result = await nitroliteClient.settleGameSession(gameResult, betAmount)

    // Add to history
    setSessionHistory(prev => [
      ...prev,
      {
        ...activeSession,
        result,
        settledAt: Date.now(),
        status: 'settled',
      },
    ])

    setActiveSession(null)
    return result
  }, [activeSession])

  // Set up event listeners
  useEffect(() => {
    const handleDisconnect = () => {
      setIsConnected(false)
    }

    const handleError = (error) => {
      setConnectionError(error?.message || 'Unknown error')
    }

    nitroliteClient.on('disconnected', handleDisconnect)
    nitroliteClient.on('error', handleError)

    return () => {
      nitroliteClient.off('disconnected', handleDisconnect)
      nitroliteClient.off('error', handleError)
    }
  }, [])

  // Auto-reconnect when wallet changes
  useEffect(() => {
    if (isWalletConnected && walletClient && !isConnected && !isConnecting) {
      // Could auto-connect here if desired
    }
  }, [isWalletConnected, walletClient, isConnected, isConnecting])

  const value = {
    // Connection state
    isConnected,
    isConnecting,
    connectionError,
    
    // Session state
    activeSession,
    sessionHistory,
    hasActiveSession: !!activeSession,
    
    // Actions
    connect,
    disconnect,
    createSession,
    settleSession,
    
    // Utils
    formatBetAmount: (amount = DEFAULT_BET_AMOUNT) => {
      return (parseInt(amount) / 1_000_000).toFixed(2)
    },
    defaultBetAmount: DEFAULT_BET_AMOUNT,
  }

  return (
    <YellowNetworkContext.Provider value={value}>
      {children}
    </YellowNetworkContext.Provider>
  )
}

/**
 * Hook to access Yellow Network context
 */
export function useYellowNetwork() {
  const context = useContext(YellowNetworkContext)
  if (!context) {
    throw new Error('useYellowNetwork must be used within YellowNetworkProvider')
  }
  return context
}

export default YellowNetworkProvider
