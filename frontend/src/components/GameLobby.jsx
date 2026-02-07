import React, { useState, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { matchmaking } from '../services/matchmaking'
import { yellowNetwork, BET_AMOUNT } from '../services/yellowNetwork'

function GameLobby({ modeId, modeName, onGameStart, onCancel }) {
  const { address } = useAccount()
  const [status, setStatus] = useState('connecting') // connecting, placing_bet, waiting, matched, error
  const [error, setError] = useState(null)
  const [opponent, setOpponent] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [countdown, setCountdown] = useState(null)
  
  // Use ref to avoid stale closure and prevent re-running effect when callback changes
  const onGameStartRef = useRef(onGameStart)
  const gameStartedRef = useRef(false)
  
  useEffect(() => {
    onGameStartRef.current = onGameStart
  }, [onGameStart])

  useEffect(() => {
    let mounted = true

    const initLobby = async () => {
      try {
        // Step 1: Connect to matchmaking server
        setStatus('connecting')
        await matchmaking.connect()
        
        if (!mounted) return

        // Step 2: Place bet via Yellow Network
        setStatus('placing_bet')
        
        // For now, we'll create a signed bet proof
        // In production, this would lock USDC in a state channel
        await yellowNetwork.setupWallet()
        const betProof = await yellowNetwork.getBetProof(BET_AMOUNT)
        
        if (!mounted) return

        // Step 3: Join lobby
        setStatus('waiting')
        matchmaking.joinLobby(modeId, address, betProof)

        // Listen for match events
        matchmaking.on('match_found', (data) => {
          if (!mounted) return
          setStatus('matched')
          setGameData(data)
        })

        matchmaking.on('game_start', (data) => {
          if (!mounted) return
          setOpponent(data.opponent)
          setGameData(data)
          gameStartedRef.current = true // Mark that game has started
          
          // Countdown before game starts
          setCountdown(3)
          const timer = setInterval(() => {
            setCountdown(prev => {
              if (prev <= 1) {
                clearInterval(timer)
                // Call onGameStart outside of the setState updater to avoid
                // updating parent state during render
                setTimeout(() => onGameStartRef.current(data), 0)
                return 0
              }
              return prev - 1
            })
          }, 1000)
        })

        matchmaking.on('opponent_disconnected', () => {
          if (!mounted) return
          setStatus('error')
          setError('Partner disconnected. Your entry fee will be refunded.')
        })

      } catch (err) {
        if (!mounted) return
        console.error('Lobby error:', err)
        setStatus('error')
        setError(err.message || 'Failed to join lobby')
      }
    }

    initLobby()

    return () => {
      mounted = false
      // Only cleanup if we haven't started a game
      // The game screen will handle its own cleanup when done
      if (!gameStartedRef.current) {
        matchmaking.leaveLobby(modeId)
        matchmaking.disconnect()
      }
    }
  }, [modeId, address])

  const handleCancel = () => {
    matchmaking.leaveLobby(modeId)
    matchmaking.disconnect()
    onCancel()
  }

  const formatUSDC = (amount) => {
    return (parseInt(amount) / 1000000).toFixed(2)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
        {/* Header */}
        <h2 className="text-2xl font-bold text-white mb-2">{modeName}</h2>
        <p className="text-[#9fb0cc] text-sm mb-6">2-Player Collaborative Mode</p>

        {/* Entry Fee */}
        <div className="bg-white/5 rounded-lg p-4 mb-6">
          <p className="text-xs text-[#6ea0d6] uppercase tracking-wide mb-1">Entry Fee</p>
          <p className="text-3xl font-bold text-green-400">${formatUSDC(BET_AMOUNT)} USDC</p>
        </div>

        {/* Status Display */}
        <div className="mb-6">
          {status === 'connecting' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white">Connecting to server...</p>
            </div>
          )}

          {status === 'placing_bet' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white">Placing bet...</p>
              <p className="text-[#9fb0cc] text-sm">Please sign the transaction in your wallet</p>
            </div>
          )}

          {status === 'waiting' && (
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-purple-500/30 rounded-full"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-white text-lg">Finding a partner...</p>
              <p className="text-[#9fb0cc] text-sm">Looking for someone to build with you!</p>
              
              {/* Animated dots */}
              <div className="flex gap-1 mt-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          )}

          {status === 'matched' && (
            <div className="flex flex-col items-center gap-3">
              <div className="text-5xl">🤝</div>
              <p className="text-green-400 text-xl font-bold">Partner Found!</p>
              {opponent && (
                <p className="text-[#9fb0cc] text-sm font-mono">
                  {opponent.address.slice(0, 6)}...{opponent.address.slice(-4)}
                </p>
              )}
              {countdown !== null && (
                <div className="mt-4">
                  <p className="text-white">Game starts in</p>
                  <p className="text-6xl font-bold text-yellow-400 animate-pulse">{countdown}</p>
                </div>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <div className="text-5xl">❌</div>
              <p className="text-red-400 font-semibold">{error}</p>
            </div>
          )}
        </div>

        {/* Reward Info */}
        {status === 'waiting' && (
          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg p-4 mb-6">
            <p className="text-xs text-purple-400 uppercase tracking-wide mb-1">Team Reward Pool</p>
            <p className="text-2xl font-bold text-white">${formatUSDC(BET_AMOUNT) * 2} USDC</p>
            <p className="text-xs text-[#9fb0cc] mt-1">Build together, earn together based on tower height!</p>
          </div>
        )}

        {/* Cancel Button */}
        {(status === 'waiting' || status === 'connecting' || status === 'error') && (
          <button
            onClick={handleCancel}
            className="w-full py-3 px-6 text-base font-semibold text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg transition-all duration-150"
          >
            {status === 'error' ? 'Go Back' : 'Cancel'}
          </button>
        )}

        {/* Powered by Yellow Network */}
        <p className="text-xs text-[#6ea0d6] mt-6">
          ⚡ Powered by Yellow Network State Channels
        </p>
      </div>
    </div>
  )
}

export default GameLobby
