import React, { useState, useEffect, useRef } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { matchmaking } from '../services/matchmaking'
import { nitroliteClient, DEFAULT_ENTRY_FEE, REWARD_TIERS } from '../services/nitroliteClient'

// Alias for backwards compatibility
const ENTRY_FEE = DEFAULT_ENTRY_FEE

function GameLobby({ modeId, modeName, onGameStart, onCancel }) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [status, setStatus] = useState('connecting') // connecting, placing_bet, creating_channel, waiting, matched, error
  const [error, setError] = useState(null)
  const [opponent, setOpponent] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  
  // Use ref to avoid stale closure and prevent re-running effect when callback changes
  const onGameStartRef = useRef(onGameStart)
  const gameStartedRef = useRef(false)
  
  useEffect(() => {
    onGameStartRef.current = onGameStart
  }, [onGameStart])

  useEffect(() => {
    // Wait for wallet client to be ready
    if (!walletClient || !address) {
      return
    }
    
    let mounted = true

    const initLobby = async () => {
      try {
        // Step 1: Connect to matchmaking server
        setStatus('connecting')
        await matchmaking.connect()
        
        if (!mounted) return

        // Step 2: Initialize Yellow Network Nitrolite client
        setStatus('placing_bet')
        
        // Initialize the Nitrolite client with wallet
        nitroliteClient.initialize(walletClient, address)
        
        // Connect to ClearNode
        await nitroliteClient.connect()
        
        if (!mounted) return

        // Step 3: Join lobby with signed commitment
        setStatus('waiting')
        
        // Create a bet commitment proof (signed message)
        const betCommitment = {
          type: 'bet_commitment',
          amount: ENTRY_FEE,
          asset: 'usdc',
          timestamp: Date.now(),
          address: address,
        }
        
        // Sign the commitment
        const commitmentMessage = JSON.stringify(betCommitment)
        const signature = await walletClient.signMessage({ 
          message: commitmentMessage,
          account: walletClient.account 
        })
        
        const betProof = { ...betCommitment, signature }
        
        matchmaking.joinLobby(modeId, address, betProof)

        // Listen for match events
        matchmaking.on('match_found', (data) => {
          if (!mounted) return
          setStatus('matched')
          setGameData(data)
        })

        matchmaking.on('game_start', async (data) => {
          if (!mounted) return
          setOpponent(data.opponent)
          setGameData(data)
          gameStartedRef.current = true // Mark that game has started
          
          // Create Yellow Network state channel for the game
          setStatus('creating_channel')
          try {
            const session = await nitroliteClient.createGameSession(
              data.opponent.address,
              ENTRY_FEE
            )
            
            if (session?.appSessionId) {
              setSessionId(session.appSessionId)
              // Add session ID to game data for settlement later
              data.sessionId = session.appSessionId
            }
          } catch (channelError) {
            console.warn('Failed to create state channel, continuing without betting:', channelError)
            // Continue without state channel in demo mode
          }
          
          // Countdown before game starts
          setCountdown(3)
          const timer = setInterval(() => {
            setCountdown(prev => {
              if (prev <= 1) {
                clearInterval(timer)
                // Call onGameStart outside of the setState updater to avoid
                // updating parent state during render
                setTimeout(() => onGameStartRef.current({
                  ...data,
                  sessionId: sessionId || data.sessionId,
                  betAmount: ENTRY_FEE
                }), 0)
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
  }, [modeId, address, walletClient])

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
          <p className="text-3xl font-bold text-green-400">${formatUSDC(ENTRY_FEE)} USDC</p>
        </div>

        {/* Status Display */}
        <div className="mb-6">
          {(!walletClient || !address) && status === 'connecting' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white">Waiting for wallet...</p>
              <p className="text-[#9fb0cc] text-sm">Please connect your wallet to continue</p>
            </div>
          )}
          
          {walletClient && address && status === 'connecting' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white">Connecting to server...</p>
            </div>
          )}

          {status === 'placing_bet' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white">Connecting to Yellow Network...</p>
              <p className="text-[#9fb0cc] text-sm">Initializing state channel</p>
            </div>
          )}

          {status === 'creating_channel' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white">Creating State Channel...</p>
              <p className="text-[#9fb0cc] text-sm">Locking bets in secure off-chain channel</p>
              <div className="mt-2 px-3 py-1 bg-yellow-500/20 rounded-full">
                <span className="text-yellow-400 text-xs">⚡ Powered by Nitrolite</span>
              </div>
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

        {/* Reward Tiers Info */}
        {status === 'waiting' && (
          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg p-4 mb-6">
            <p className="text-xs text-purple-400 uppercase tracking-wide mb-3">Performance Rewards</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {REWARD_TIERS.slice().reverse().map((tier, idx) => (
                <div 
                  key={tier.name}
                  className={`px-2 py-1 rounded ${
                    tier.multiplier >= 2 ? 'bg-yellow-500/20 text-yellow-400' :
                    tier.multiplier >= 1.5 ? 'bg-purple-500/20 text-purple-400' :
                    tier.multiplier >= 1.2 ? 'bg-blue-500/20 text-blue-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  <span className="font-bold">{tier.multiplier}x</span>
                  <span className="text-xs ml-1">≥{tier.minHeight}px</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#9fb0cc] mt-3">Build higher together = earn more! 🚀</p>
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
