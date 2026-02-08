import React, { useState, useCallback, useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { nitroliteClient, DEFAULT_ENTRY_FEE, REWARD_TIERS, getRewardTier } from '../../services/nitroliteClient'
import { ensGameHistory, createGameHistoryEntry } from '../../services/ensGameHistory'

/**
 * Settlement states
 */
const SettlementState = {
  PENDING: 'pending',
  SETTLING: 'settling',
  SUCCESS: 'success',
  ERROR: 'error',
}

/**
 * GameSettlement Component
 * Handles the on-chain settlement of game results via Yellow Network state channels
 * 
 * Only Player 1 (who submitted the session to ClearNode) can settle.
 * Player 2 waits for settlement confirmation from Player 1.
 */
function GameSettlement({ 
  gameResult, 
  sessionId, 
  player1Address, 
  player2Address,
  playerNumber = 1, // 1 = can settle, 2 = waits for Player 1
  entryFee = DEFAULT_ENTRY_FEE,
  onSettlementComplete,
  onSkip
}) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  
  const [state, setState] = useState(SettlementState.PENDING)
  const [error, setError] = useState(null)
  const [settlementDetails, setSettlementDetails] = useState(null)
  const [ensStatus, setEnsStatus] = useState(null) // 'saving' | 'saved' | 'error' | 'no-ens'
  const [ensName, setEnsName] = useState(null)

  // Initialize ENS service when wallet is available
  useEffect(() => {
    if (publicClient && walletClient) {
      ensGameHistory.initialize(publicClient, walletClient)
      // Try to get ENS name for current user
      ensGameHistory.getENSName(address).then(name => {
        if (name) {
          setEnsName(name)
          console.log('😜 ENS name found:', name)
        }
      })
    }
  }, [publicClient, walletClient, address])

  // Format USDC amount for display (6 decimals)
  const formatUSDC = (amount) => {
    if (!amount) return '0.00'
    return (parseInt(amount) / 1_000_000).toFixed(2)
  }

  // Calculate payout preview based on game result with performance multipliers
  const calculatePayouts = useCallback(() => {
    if (!gameResult) return null

    const towerHeight = gameResult.towerHeight || 0
    const rewardTier = getRewardTier(towerHeight)

    const entryFeeAmount = BigInt(entryFee)
    const totalEntryFees = entryFeeAmount * 2n
    
    // Apply multiplier
    const multiplierBasis = BigInt(Math.floor(rewardTier.multiplier * 100))
    const totalRewards = (totalEntryFees * multiplierBasis) / 100n
    
    // Protocol fee only on bonus portion
    const bonusPortion = totalRewards - totalEntryFees
    const protocolFee = bonusPortion > 0n ? bonusPortion * 5n / 100n : 0n
    const distributableRewards = totalRewards - protocolFee

    // Equal split
    const playerPayout = distributableRewards / 2n
    const profit = playerPayout - entryFeeAmount

    return {
      player1Payout: playerPayout.toString(),
      player2Payout: playerPayout.toString(),
      protocolFee: protocolFee.toString(),
      towerHeight,
      rewardTier,
      profit: profit.toString(),
      isProfit: profit > 0n,
    }
  }, [gameResult, entryFee])

  const payoutPreview = calculatePayouts()

  // Check if this is a demo session
  const isDemoSession = sessionId?.startsWith('demo_session_')
  
  // Player 2 cannot settle real sessions (only Player 1 has the appSessionId)
  const canSettle = playerNumber === 1 || isDemoSession

  // Save game to ENS history
  const saveToENS = async (result) => {
    if (!ensName) {
      setEnsStatus('no-ens')
      return
    }

    try {
      setEnsStatus('saving')
      
      const historyEntry = createGameHistoryEntry({
        sessionId,
        towerHeight: payoutPreview?.towerHeight || gameResult?.towerHeight || 0,
        blocksPlaced: gameResult?.totalBlocks || 0,
        turns: gameResult?.turnsPlayed || 0,
        rewardTier: payoutPreview?.rewardTier,
        payout: playerNumber === 1 ? result.player1Payout : result.player2Payout,
        partnerAddress: playerNumber === 1 ? player2Address : player1Address,
        chainId: publicClient?.chain?.id || 11155111,
      })

      const ensResult = await ensGameHistory.saveGameToHistory(ensName, historyEntry)
      
      if (ensResult.success) {
        setEnsStatus('saved')
        console.log('✅ Game saved to ENS:', ensResult)
      } else {
        setEnsStatus('error')
        console.warn('⚠️ Could not save to ENS:', ensResult.error)
      }
    } catch (err) {
      console.error('Failed to save to ENS:', err)
      setEnsStatus('error')
    }
  }

  // Handle settlement
  const handleSettle = useCallback(async () => {
    console.log('🔘 Settle button clicked!', { sessionId, player1Address, player2Address, isDemoSession, playerNumber, canSettle })
    
    if (!sessionId) {
      console.error('❌ No sessionId')
      setError('Missing session information')
      return
    }

    // Player 2 cannot settle real sessions
    if (!canSettle) {
      setError('Only Player 1 can settle. Please wait for settlement confirmation.')
      setState(SettlementState.ERROR)
      return
    }

    setState(SettlementState.SETTLING)
    setError(null)

    try {
      // Demo mode: simulate settlement with realistic-looking data
      if (isDemoSession) {
        console.log('🎮 Demo mode: Simulating settlement...')
        
        // Multi-step simulation for realism
        await new Promise(resolve => setTimeout(resolve, 800))
        console.log('📤 Signing state update...')
        await new Promise(resolve => setTimeout(resolve, 600))
        console.log('📡 Broadcasting to ClearNode...')
        await new Promise(resolve => setTimeout(resolve, 700))
        console.log('⛓️ Finalizing on-chain...')
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Generate realistic-looking transaction hash
        const randomBytes = Array.from({ length: 32 }, () => 
          Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
        ).join('')
        const txHash = `0x${randomBytes}`
        
        // Create simulated settlement result
        const simulatedResult = {
          player1Payout: payoutPreview?.player1Payout || '1000000',
          player2Payout: payoutPreview?.player2Payout || '1000000',
          protocolFee: payoutPreview?.protocolFee || '0',
          txHash,
          blockNumber: 12345678 + Math.floor(Math.random() * 1000),
          settled: true,
          demo: true,
        }
        
        console.log('✅ Demo settlement complete:', simulatedResult)
        setSettlementDetails(simulatedResult)
        setState(SettlementState.SUCCESS)
        
        // Save to ENS (async, don't block)
        saveToENS(simulatedResult)
        
        if (onSettlementComplete) {
          onSettlementComplete(simulatedResult)
        }
        return
      }

      // Real mode: settle with shared tower height via Nitrolite
      // First, ensure we have the session ID stored
      if (!nitroliteClient.appSessionId && sessionId && !isDemoSession) {
        console.log('📝 Setting appSessionId from prop:', sessionId)
        nitroliteClient.appSessionId = sessionId
      }
      
      console.log('⚡ Real mode: Settling via Nitrolite...')
      const result = await nitroliteClient.settleGameSession({
        towerHeight: payoutPreview?.towerHeight || 0,
        player1Address,
        player2Address,
      }, entryFee)

      setSettlementDetails(result)
      setState(SettlementState.SUCCESS)
      
      // Save to ENS (async, don't block)
      saveToENS(result)
      
      if (onSettlementComplete) {
        onSettlementComplete(result)
      }
    } catch (err) {
      console.error('Settlement failed:', err)
      setError(err.message || 'Failed to settle game')
      setState(SettlementState.ERROR)
    }
  }, [sessionId, player1Address, player2Address, payoutPreview, entryFee, onSettlementComplete, isDemoSession])

  // Auto-settle option (could be enabled based on settings)
  useEffect(() => {
    // Could add auto-settlement logic here
  }, [])

  // No session - show skip option
  if (!sessionId) {
    return (
      <div className="bg-gradient-to-b from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl p-6 mt-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">⚡</span>
          <h3 className="text-lg font-bold text-yellow-400">Yellow Network Settlement</h3>
        </div>
        
        <p className="text-[#9fb0cc] text-sm mb-4">
          No active state channel session. This game was played in demo mode.
        </p>
        
        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full py-2 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
          >
            Continue
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-b from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl p-6 mt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">⚡</span>
        <h3 className="text-lg font-bold text-yellow-400">Yellow Network Settlement</h3>
      </div>

      {/* Payout Preview */}
      {state === SettlementState.PENDING && (
        <>
          <div className="bg-black/20 rounded-lg p-4 mb-4">
            <p className="text-xs text-[#9fb0cc] uppercase mb-3">Performance Rewards</p>
            
            {/* Tower Achievement & Tier */}
            <div className="text-center mb-4 pb-3 border-b border-white/10">
              <p className="text-xs text-[#9fb0cc]">Tower Built Together</p>
              <p className="text-3xl font-bold text-purple-400">{payoutPreview?.towerHeight || gameResult?.towerHeight || 0}px</p>
              
              {/* Reward Tier Badge */}
              {payoutPreview?.rewardTier && (
                <div className={`inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full ${
                  payoutPreview.rewardTier.multiplier >= 2 ? 'bg-yellow-500/20 text-yellow-400' :
                  payoutPreview.rewardTier.multiplier >= 1.5 ? 'bg-purple-500/20 text-purple-400' :
                  payoutPreview.rewardTier.multiplier >= 1.2 ? 'bg-blue-500/20 text-blue-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  <span>{payoutPreview.rewardTier.name}</span>
                  <span className="font-bold">{payoutPreview.rewardTier.multiplier}x</span>
                </div>
              )}
              
              {/* Profit indicator */}
              {payoutPreview?.isProfit && (
                <p className="text-green-400 text-sm mt-2">
                  +${formatUSDC(payoutPreview.profit)} profit each! 🎉
                </p>
              )}
            </div>
            
            <div className="space-y-3">
              {/* You */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👤</span>
                  <div>
                    <p className="text-white font-medium">You</p>
                    <p className="text-xs text-[#9fb0cc]">Entry: ${formatUSDC(entryFee)}</p>
                  </div>
                </div>
                <p className={`text-xl font-bold ${payoutPreview?.isProfit ? 'text-green-400' : 'text-white'}`}>
                  ${formatUSDC(payoutPreview?.player1Payout || entryFee)}
                </p>
              </div>

              {/* Partner */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🤝</span>
                  <div>
                    <p className="text-white font-medium">Partner</p>
                    <p className="text-xs text-[#9fb0cc]">Entry: ${formatUSDC(entryFee)}</p>
                  </div>
                </div>
                <p className={`text-xl font-bold ${payoutPreview?.isProfit ? 'text-green-400' : 'text-white'}`}>
                  ${formatUSDC(payoutPreview?.player2Payout || entryFee)}
                </p>
              </div>

              {/* Protocol Fee - only shown if there's a bonus */}
              {payoutPreview && parseInt(payoutPreview.protocolFee) > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-white/10">
                  <p className="text-[#9fb0cc] text-sm">Protocol Fee (5% of bonus)</p>
                  <p className="text-[#9fb0cc]">${formatUSDC(payoutPreview.protocolFee)}</p>
                </div>
              )}
            </div>
            
            {/* Next tier hint */}
            {payoutPreview?.rewardTier?.multiplier < 2 && (
              <div className="mt-3 pt-3 border-t border-white/10 text-center">
                <p className="text-xs text-[#9fb0cc]">
                  {(payoutPreview?.towerHeight || 0) < 100 && `Reach 100px for 1.2x rewards!`}
                  {(payoutPreview?.towerHeight || 0) >= 100 && (payoutPreview?.towerHeight || 0) < 200 && `Reach 200px for 1.5x rewards!`}
                  {(payoutPreview?.towerHeight || 0) >= 200 && (payoutPreview?.towerHeight || 0) < 300 && `Reach 300px for 2x rewards!`}
                </p>
              </div>
            )}
          </div>

          {/* Settle Button - Only for Player 1 or Demo */}
          {canSettle ? (
            <>
              <button
                onClick={handleSettle}
                className="w-full py-3 px-6 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>⚡</span>
                Settle On-Chain
              </button>

              <p className="text-xs text-[#9fb0cc] text-center mt-2">
                Finalize balances through Nitrolite smart contracts
              </p>
            </>
          ) : (
            <>
              <div className="w-full py-3 px-6 bg-gray-600/50 text-gray-300 font-bold rounded-lg flex items-center justify-center gap-2">
                <span className="animate-pulse">⏳</span>
                Waiting for Partner to Settle
              </div>
              
              <p className="text-xs text-[#9fb0cc] text-center mt-2">
                Your partner (Player 1) will settle the game
              </p>
              
              {onSkip && (
                <button
                  onClick={onSkip}
                  className="mt-3 w-full py-2 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  Skip & Return to Menu
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* Settling State */}
      {state === SettlementState.SETTLING && (
        <div className="flex flex-col items-center py-4">
          <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white font-medium">Settling on-chain...</p>
          <p className="text-[#9fb0cc] text-sm">Broadcasting to Yellow Network</p>
          <div className="mt-3 text-xs text-[#6ea0d6] font-mono animate-pulse">
            Processing transaction...
          </div>
        </div>
      )}

      {/* Success State */}
      {state === SettlementState.SUCCESS && settlementDetails && (
        <div className="text-center py-4">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-green-400 font-bold text-lg mb-2">Settlement Complete!</p>
          <p className="text-[#9fb0cc] text-sm mb-4">
            Funds distributed via Yellow Network State Channel
          </p>
          
          {/* Session ID Display */}
          {sessionId && !sessionId.startsWith('demo_') && (
            <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
              <p className="text-xs text-yellow-400 mb-1 flex items-center justify-center gap-1">
                <span>⚡</span> Yellow Network Session
              </p>
              <p className="text-xs font-mono text-[#e6eef8] break-all">
                {sessionId}
              </p>
            </div>
          )}
          
          <div className="bg-black/20 rounded-lg p-3 text-left mb-3">
            <p className="text-xs text-[#9fb0cc] mb-1">Your Payout</p>
            <p className="text-2xl font-bold text-green-400">
              ${formatUSDC(playerNumber === 1 ? settlementDetails.player1Payout : settlementDetails.player2Payout)} USDC
            </p>
          </div>
          
          {/* Settlement Explanation */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-left mb-3">
            <p className="text-xs text-blue-300 mb-1 flex items-center gap-1">
              <span>ℹ️</span> State Channel Settlement
            </p>
            <p className="text-xs text-[#9fb0cc]">
              Funds are settled off-chain via Yellow Network state channels. 
              No gas fees! Your balance is updated instantly in the ClearNode.
            </p>
            {settlementDetails.demo && (
              <p className="text-xs text-yellow-400 mt-2">⚠️ Demo mode - no real funds involved</p>
            )}
          </div>

          {/* ENS History Status */}
          {ensName && (
            <div className="bg-black/20 rounded-lg p-3 text-left mb-3">
              <p className="text-xs text-[#9fb0cc] mb-1">Game History</p>
              {ensStatus === 'saving' && (
                <p className="text-xs text-yellow-400">📝 Saving to {ensName}...</p>
              )}
              {ensStatus === 'saved' && (
                <div>
                  <p className="text-xs text-green-400 mb-2">✅ Saved to {ensName}</p>
                  <a
                    href={`https://app.ens.domains/${ensName}?tab=records`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    📜 View Game History on ENS
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
              {ensStatus === 'error' && (
                <p className="text-xs text-red-400">⚠️ Could not save to ENS</p>
              )}
            </div>
          )}
          
          {/* No ENS - suggest getting one */}
          {!ensName && ensStatus !== 'saving' && (
            <div className="bg-black/20 rounded-lg p-3 text-left mb-3">
              <p className="text-xs text-[#9fb0cc] mb-1">Game History</p>
              <p className="text-xs text-[#6ea0d6] mb-2">
                Get an ENS name to save your game history on-chain!
              </p>
              <a
                href="https://app.ens.domains"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
              >
                🔗 Get your .eth name
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}

          {onSkip && (
            <button
              onClick={onSkip}
              className="mt-4 w-full py-2 px-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold rounded-lg transition-colors"
            >
              🏠 Back to Menu
            </button>
          )}
        </div>
      )}

      {/* Error State */}
      {state === SettlementState.ERROR && (
        <div className="text-center py-4">
          <div className="text-5xl mb-4">❌</div>
          <p className="text-red-400 font-bold mb-2">Settlement Failed</p>
          <p className="text-[#9fb0cc] text-sm mb-4">{error}</p>
          
          <div className="flex gap-2">
            <button
              onClick={handleSettle}
              className="flex-1 py-2 px-4 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors"
            >
              Retry
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="flex-1 py-2 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-xs text-[#6ea0d6] text-center">
          🔒 Secured by Nitrolite State Channels
        </p>
      </div>
    </div>
  )
}

export default GameSettlement
