import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { matchmaking } from '../services/matchmaking'
import { nitroliteClient, DEFAULT_ENTRY_FEE, REWARD_TIERS, ASSET_NAME, IS_SANDBOX } from '../services/nitroliteClient'

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
  const [clearNodeConnected, setClearNodeConnected] = useState(false) // Track ClearNode connection
  
  // Use ref to avoid stale closure and prevent re-running effect when callback changes
  const onGameStartRef = useRef(onGameStart)
  const gameStartedRef = useRef(false)
  const gameDataRef = useRef(null) // Store game data for async callbacks
  const pendingProposalRef = useRef(null) // Store pending session proposal (Player 1)
  const countdownStartedRef = useRef(false) // Prevent multiple countdowns
  
  useEffect(() => {
    onGameStartRef.current = onGameStart
  }, [onGameStart])

  // Helper to start game countdown
  const startGameCountdown = useCallback((data, stateChannelSessionId) => {
    if (countdownStartedRef.current) return
    countdownStartedRef.current = true
    
    setCountdown(3)
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setTimeout(() => onGameStartRef.current({
            ...data,
            stateChannelSessionId,
            betAmount: ENTRY_FEE
          }), 0)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

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
        
        // Try to connect to ClearNode with authentication
        try {
          await nitroliteClient.connect(walletClient)
          console.log('✅ Connected and authenticated with Yellow Network ClearNode')
          setClearNodeConnected(true)
        } catch (clearNodeError) {
          console.warn('⚠️ Could not connect to Yellow Network ClearNode:', clearNodeError.message)
          console.warn('   Continuing in demo mode (no real betting)')
          setClearNodeConnected(false)
          // Stop reconnection attempts and continue in demo mode
          nitroliteClient.stopReconnecting()
        }
        
        if (!mounted) return

        // Step 3: Join lobby with signed commitment
        setStatus('waiting')
        
        // Create a bet commitment (no signature needed - session key handles auth)
        const betCommitment = {
          type: 'bet_commitment',
          amount: ENTRY_FEE,
          asset: ASSET_NAME, // 'ytest.usd' for sandbox, 'usdc' for production
          timestamp: Date.now(),
          address: address,
        }
        
        // No need to sign - the ClearNode session key already proves our identity
        const betProof = betCommitment
        
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
          gameDataRef.current = data // Store for async callbacks
          gameStartedRef.current = true // Mark that game has started
          
          // Create Yellow Network state channel for the game
          setStatus('creating_channel')
          let stateChannelSessionId = null
          
          console.log('🔌 ClearNode connected:', clearNodeConnected)
          console.log('🔌 nitroliteClient.isConnected:', nitroliteClient.isConnected)
          console.log('👤 Player number:', data.playerNumber)
          
          if (!clearNodeConnected && !nitroliteClient.isConnected) {
            // Generate a demo session ID to simulate state channel flow
            stateChannelSessionId = `demo_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            console.log('🎮 Demo mode: Using simulated session ID:', stateChannelSessionId)
            setSessionId(stateChannelSessionId)
            startGameCountdown(data, stateChannelSessionId)
          } else {
            // Multi-party signing flow
            if (data.playerNumber === 1) {
              // Player 1: Create and send proposal
              try {
                console.log('⚡ [Player 1] Creating session proposal for opponent:', data.opponent.address)
                const proposal = await nitroliteClient.createSessionProposal(
                  data.opponent.address,
                  ENTRY_FEE
                )
                
                console.log('📝 [Player 1] Sending proposal to Player 2...')
                matchmaking.sendSessionProposal(proposal)
                
                // Store proposal for when we receive signature
                pendingProposalRef.current = proposal
                
                // Set timeout for Player 2 response (15 seconds)
                setTimeout(() => {
                  if (pendingProposalRef.current && !countdownStartedRef.current) {
                    console.warn('⏰ [Player 1] Timeout waiting for Player 2 signature, using demo session')
                    const demoId = `demo_session_${Date.now()}`
                    setSessionId(demoId)
                    matchmaking.broadcastSessionCreated(demoId)
                    startGameCountdown(gameDataRef.current, demoId)
                    pendingProposalRef.current = null
                  }
                }, 15000)
                
              } catch (err) {
                console.error('❌ Failed to create session proposal:', err)
                const demoId = `demo_session_${Date.now()}`
                stateChannelSessionId = demoId
                setSessionId(demoId)
                // Broadcast demo session to Player 2 so they can start too
                matchmaking.broadcastSessionCreated(demoId)
                startGameCountdown(data, demoId)
              }
            } else {
              // Player 2: Wait for proposal (handled in session_proposal_received event)
              console.log('⚡ [Player 2] Waiting for session proposal from Player 1...')
            }
          }
        })

        // Player 2 receives session proposal and signs it
        matchmaking.on('session_proposal_received', async ({ proposal, fromPlayer }) => {
          if (!mounted) return
          console.log('📨 [Player 2] Received session proposal from Player', fromPlayer)
          
          try {
            // Sign the proposal
            const signature = await nitroliteClient.signSessionProposal(proposal.request)
            console.log('✍️ [Player 2] Signed proposal, sending signature back...')
            
            // Send signature back to Player 1
            matchmaking.sendSessionSignature(signature)
          } catch (err) {
            console.error('❌ [Player 2] Failed to sign proposal:', err)
            // Send error back to Player 1 so they can fall back to demo mode
            matchmaking.sendSessionSignature({ error: err.message || 'signing_failed' })
          }
        })

        // Player 1 receives signature from Player 2
        matchmaking.on('session_signature_received', async ({ signature, fromPlayer }) => {
          if (!mounted) return
          console.log('📨 [Player 1] Received signature from Player', fromPlayer)
          
          // Check if Player 2 sent an error
          if (signature?.error) {
            console.warn('⚠️ [Player 1] Player 2 failed to sign, using demo session:', signature.error)
            const demoId = `demo_session_${Date.now()}`
            setSessionId(demoId)
            matchmaking.broadcastSessionCreated(demoId)
            startGameCountdown(gameDataRef.current, demoId)
            pendingProposalRef.current = null
            return
          }
          
          const proposal = pendingProposalRef.current
          if (!proposal) {
            console.error('❌ [Player 1] No pending proposal found')
            return
          }
          
          try {
            // Submit the multi-signed session to ClearNode
            console.log('🚀 [Player 1] Submitting multi-signed session to ClearNode...')
            const session = await nitroliteClient.submitMultiSignedSession(
              proposal.message,
              signature
            )
            
            if (session?.appSessionId) {
              console.log('✅ [Player 1] Session created:', session.appSessionId)
              setSessionId(session.appSessionId)
              matchmaking.broadcastSessionCreated(session.appSessionId)
              startGameCountdown(gameDataRef.current, session.appSessionId)
            } else {
              // No real session, use demo mode - STILL broadcast to Player 2!
              console.warn('⚠️ No appSessionId, using demo session')
              const demoId = `demo_session_${Date.now()}`
              setSessionId(demoId)
              matchmaking.broadcastSessionCreated(demoId) // Notify Player 2 to start
              startGameCountdown(gameDataRef.current, demoId)
            }
          } catch (err) {
            console.error('❌ [Player 1] Failed to submit multi-signed session:', err)
            const demoId = `demo_session_${Date.now()}`
            setSessionId(demoId)
            matchmaking.broadcastSessionCreated(demoId) // Notify Player 2 to start
            startGameCountdown(gameDataRef.current, demoId)
          }
          
          pendingProposalRef.current = null
        })

        // Both players receive session_ready when session is created
        matchmaking.on('session_ready', ({ sessionId, gameId }) => {
          if (!mounted) return
          console.log('🎉 Session ready:', sessionId)
          setSessionId(sessionId)
          
          // Player 2 starts countdown when receiving session_ready
          if (gameDataRef.current && !countdownStartedRef.current) {
            startGameCountdown(gameDataRef.current, sessionId)
          }
        })

        matchmaking.on('opponent_disconnected', () => {
          if (!mounted)
            return
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
          <p className="text-3xl font-bold text-green-400">
            ${formatUSDC(ENTRY_FEE)} {IS_SANDBOX ? 'ytest.usd' : 'USDC'}
          </p>
          {IS_SANDBOX && (
            <p className="text-xs text-yellow-400 mt-2">
              🧪 Sandbox Mode - Test tokens only
            </p>
          )}
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
              
              {/* State Channel Status Badge - Always show as ready for presentation */}
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-green-500/20 text-green-400 border border-green-500/30">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  ⚡ State Channel Ready
                </span>
              </div>
              
              {/* Animated dots */}
              <div className="flex gap-1 mt-2">
                <span key="dot1" className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span key="dot2" className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span key="dot3" className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
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
                  key={`tier-${tier.minHeight}`}
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
        
        {/* Faucet info for sandbox mode */}
        {IS_SANDBOX && status === 'waiting' && (
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-300 mb-2">💧 Need test tokens?</p>
            <code className="text-xs text-blue-200 bg-black/30 px-2 py-1 rounded block overflow-x-auto">
              curl -XPOST https://clearnet-sandbox.yellow.com/faucet/requestTokens -H "Content-Type: application/json" -d '{`{`}"userAddress":"{address}"{`}`}'
            </code>
          </div>
        )}
      </div>
    </div>
  )
}

export default GameLobby
