/**
 * Nitrolite State Channel Client for FlashPoint
 * 
 * Implements Yellow Network's Nitrolite protocol for:
 * - Creating application sessions (state channels) for game betting
 * - Off-chain state updates during gameplay
 * - Settling final game results on-chain
 * 
 * @see https://docs.yellow.org/nitrolite
 */

import {
  createAppSessionMessage,
  createCloseAppSessionMessage,
  generateRequestId,
  getCurrentTimestamp,
  parseCreateAppSessionResponse,
  parseCloseAppSessionResponse,
  RPCMethod,
  RPCChannelStatus,
} from '@erc7824/nitrolite'

// ClearNode WebSocket endpoints
const CLEARNODE_SANDBOX = 'wss://clearnet-test.yellow.com/ws'
const CLEARNODE_PRODUCTION = 'wss://clearnet.yellow.com/ws'

// Default to sandbox/testnet for development
const CLEARNODE_URL = import.meta.env.VITE_CLEARNODE_URL || CLEARNODE_SANDBOX

// Protocol version for FlashPoint game
const FLASHPOINT_PROTOCOL = 'NitroRPC/0.4'

// Game entry fee in USDC (with 6 decimals)
// 1 USDC = 1000000
export const DEFAULT_ENTRY_FEE = '1000000' // 1 USDC
export const DEFAULT_BET_AMOUNT = DEFAULT_ENTRY_FEE // Alias for compatibility

// Performance-based reward tiers for collaborative gameplay
// Players earn bonuses based on tower height achieved together
export const REWARD_TIERS = [
  { minHeight: 300, multiplier: 2.0, label: '🏆 Legendary', bonus: '100%' },
  { minHeight: 200, multiplier: 1.5, label: '🥇 Epic', bonus: '50%' },
  { minHeight: 100, multiplier: 1.2, label: '🥈 Great', bonus: '20%' },
  { minHeight: 0, multiplier: 1.0, label: '✅ Complete', bonus: '0%' },
]

/**
 * Get reward tier based on tower height
 */
export function getRewardTier(towerHeight) {
  for (const tier of REWARD_TIERS) {
    if (towerHeight >= tier.minHeight) {
      return tier
    }
  }
  return REWARD_TIERS[REWARD_TIERS.length - 1]
}

/**
 * Creates a message signer function from a wallet client
 * @param {Object} walletClient - Viem wallet client
 * @returns {Function} Message signer function
 */
export function createMessageSigner(walletClient) {
  return async (payload) => {
    const message = JSON.stringify(payload)
    const signature = await walletClient.signMessage({
      message,
      account: walletClient.account,
    })
    return signature
  }
}

/**
 * NitroliteClient class for managing state channel operations
 */
class NitroliteClient {
  constructor() {
    this.ws = null
    this.isConnected = false
    this.signer = null
    this.userAddress = null
    this.appSessionId = null
    this.pendingRequests = new Map()
    this.eventHandlers = new Map()
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
  }

  /**
   * Initialize the client with a wallet
   * @param {Object} walletClient - Viem wallet client
   * @param {string} address - User's wallet address
   */
  initialize(walletClient, address) {
    this.signer = createMessageSigner(walletClient)
    this.userAddress = address
    console.log('🔐 NitroliteClient initialized for:', address)
  }

  /**
   * Connect to the ClearNode WebSocket server
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('🌐 Connecting to Yellow Network ClearNode...')
        this.ws = new WebSocket(CLEARNODE_URL)

        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            this.ws?.close()
            reject(new Error('Connection timeout'))
          }
        }, 15000)

        this.ws.onopen = () => {
          clearTimeout(timeout)
          this.isConnected = true
          this.reconnectAttempts = 0
          console.log('✅ Connected to Yellow Network ClearNode')
          this.emit('connected')
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error)
          this.emit('error', error)
        }

        this.ws.onclose = (event) => {
          console.log('🔌 WebSocket closed:', event.code, event.reason)
          this.isConnected = false
          this.emit('disconnected', event)
          
          // Attempt reconnection for abnormal closures
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect()
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Attempt to reconnect to the server
   */
  attemptReconnect() {
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`)
    
    setTimeout(() => {
      this.connect().catch(console.error)
    }, delay)
  }

  /**
   * Handle incoming WebSocket messages
   * @param {string} data - Raw message data
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data)
      console.log('📨 Received:', message)

      // Handle response messages
      if (message.res) {
        const [requestId, method, params, timestamp] = message.res
        
        // Resolve pending request
        if (this.pendingRequests.has(requestId)) {
          const { resolve } = this.pendingRequests.get(requestId)
          this.pendingRequests.delete(requestId)
          resolve({ method, params, timestamp, raw: message })
        }

        // Emit method-specific events
        this.emit(method, { params, timestamp })
      }

      // Handle error messages
      if (message.err) {
        const [requestId, errorCode, errorMessage] = message.err
        console.error(`❌ RPC Error [${errorCode}]:`, errorMessage)
        
        if (this.pendingRequests.has(requestId)) {
          const { reject } = this.pendingRequests.get(requestId)
          this.pendingRequests.delete(requestId)
          reject(new Error(`${errorCode}: ${errorMessage}`))
        }

        this.emit('error', { code: errorCode, message: errorMessage })
      }

      // Handle notification/update messages
      if (message.method) {
        this.emit(message.method, message)
      }

    } catch (error) {
      console.error('Failed to parse message:', error, data)
    }
  }

  /**
   * Send a message and wait for response
   * @param {string} message - JSON stringified message
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>}
   */
  async sendAndWait(message, timeout = 30000) {
    if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to ClearNode')
    }

    const parsed = JSON.parse(message)
    const requestId = parsed.req?.[0]

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId)
          reject(new Error('Request timeout'))
        }
      }, timeout)

      this.pendingRequests.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeoutId)
          resolve(data)
        },
        reject: (error) => {
          clearTimeout(timeoutId)
          reject(error)
        }
      })

      console.log('📤 Sending:', parsed)
      this.ws.send(message)
    })
  }

  /**
   * Create a game session (application session / state channel)
   * Both players must have deposited funds and authenticated with ClearNode
   * 
   * @param {string} opponentAddress - Opponent's wallet address
   * @param {string} betAmount - Bet amount in USDC (6 decimals)
   * @returns {Promise<Object>} App session details
   */
  async createGameSession(opponentAddress, betAmount = DEFAULT_BET_AMOUNT) {
    if (!this.signer || !this.userAddress) {
      throw new Error('Client not initialized. Call initialize() first.')
    }

    // Define the application session parameters
    const appDefinition = {
      protocol: FLASHPOINT_PROTOCOL,
      application: 'FlashPoint',
      participants: [this.userAddress, opponentAddress],
      weights: [50, 50], // Equal voting weight
      quorum: 100, // Both must agree for state updates
      challenge: 0, // No challenge period for instant settlement
      nonce: Date.now(),
    }

    // Initial allocations - both players lock their bet
    const allocations = [
      {
        participant: this.userAddress,
        asset: 'usdc',
        amount: betAmount,
      },
      {
        participant: opponentAddress,
        asset: 'usdc',
        amount: betAmount,
      },
    ]

    // Create the signed message
    const signedMessage = await createAppSessionMessage(
      this.signer,
      {
        definition: appDefinition,
        allocations,
      }
    )

    // Send and wait for response
    const response = await this.sendAndWait(signedMessage)
    
    if (response.params?.appSessionId) {
      this.appSessionId = response.params.appSessionId
      console.log('🎮 Game session created:', this.appSessionId)
    }

    return response.params
  }

  /**
   * Close the game session and settle with final allocations
   * Collaborative mode: both players earn performance-based rewards
   * 
   * @param {Object} gameResult - Game result
   * @param {number} gameResult.towerHeight - Combined tower height built together
   * @param {string} gameResult.player1Address - Player 1's address
   * @param {string} gameResult.player2Address - Player 2's address
   * @param {string} entryFee - Original entry fee
   * @returns {Promise<Object>} Settlement result
   */
  async settleGameSession(gameResult, entryFee = DEFAULT_ENTRY_FEE) {
    if (!this.appSessionId) {
      throw new Error('No active game session')
    }

    const { towerHeight, player1Address, player2Address } = gameResult
    
    // Get reward tier based on performance
    const rewardTier = getRewardTier(towerHeight)
    
    // Calculate rewards: entry fees × multiplier
    // In production, bonus comes from treasury/reward pool
    const entryFeeAmount = BigInt(entryFee)
    const totalEntryFees = entryFeeAmount * 2n
    
    // Apply multiplier (using integer math: multiply then divide by 100)
    const multiplierBasis = BigInt(Math.floor(rewardTier.multiplier * 100))
    const totalRewards = (totalEntryFees * multiplierBasis) / 100n
    
    // Protocol fee only on bonus portion (not on returned stakes)
    const bonusPortion = totalRewards - totalEntryFees
    const protocolFee = bonusPortion > 0n ? bonusPortion * 5n / 100n : 0n // 5% of bonus
    const distributableRewards = totalRewards - protocolFee

    // Equal split for collaborative gameplay
    const player1Payout = distributableRewards / 2n
    const player2Payout = distributableRewards / 2n

    // Final allocations for settlement
    const allocations = [
      {
        participant: player1Address,
        asset: 'usdc',
        amount: player1Payout.toString(),
      },
      {
        participant: player2Address,
        asset: 'usdc',
        amount: player2Payout.toString(),
      },
    ]

    // Create the signed close message
    const signedMessage = await createCloseAppSessionMessage(
      this.signer,
      {
        app_session_id: this.appSessionId,
        allocations,
        session_data: JSON.stringify({
          gameType: 'flashpoint-collaborative',
          towerHeight,
          rewardTier: rewardTier.label,
          multiplier: rewardTier.multiplier,
          settledAt: Date.now(),
        }),
      }
    )

    // Send and wait for response
    const response = await this.sendAndWait(signedMessage)
    
    console.log('💰 Game settled:', response.params)
    
    // Clear session
    const settledSessionId = this.appSessionId
    this.appSessionId = null

    return {
      ...response.params,
      player1Payout: player1Payout.toString(),
      player2Payout: player2Payout.toString(),
      protocolFee: protocolFee.toString(),
      rewardTier,
      towerHeight,
      multiplier: rewardTier.multiplier,
    }
  }

  /**
   * Submit an intermediate game state update
   * Used for tracking state during gameplay
   * 
   * @param {Object} gameState - Current game state
   * @returns {Promise<Object>}
   */
  async submitGameState(gameState) {
    if (!this.appSessionId || !this.signer) {
      throw new Error('No active game session')
    }

    // Import dynamically to handle different protocol versions
    const { createSubmitAppStateMessage } = await import('@erc7824/nitrolite')

    const signedMessage = await createSubmitAppStateMessage(
      this.signer,
      {
        app_session_id: this.appSessionId,
        session_data: JSON.stringify(gameState),
        allocations: [], // Keep current allocations
        intent: 0, // Operate intent
        version: gameState.version || 1,
      }
    )

    const response = await this.sendAndWait(signedMessage)
    return response.params
  }

  /**
   * Register event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event).push(handler)
  }

  /**
   * Remove event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event)
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /**
   * Emit event to all handlers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => handler(data))
    }
  }

  /**
   * Get current session ID
   * @returns {string|null}
   */
  getSessionId() {
    return this.appSessionId
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isReady() {
    return this.isConnected && this.signer !== null
  }

  /**
   * Disconnect from ClearNode
   */
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.isConnected = false
    this.appSessionId = null
    console.log('🔌 Disconnected from ClearNode')
  }
}

// Export singleton instance
export const nitroliteClient = new NitroliteClient()
export default nitroliteClient
