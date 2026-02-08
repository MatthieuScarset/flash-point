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
  // Authentication
  createAuthRequestMessage,
  createAuthVerifyMessage,
  parseAuthChallengeResponse,
  createEIP712AuthMessageSigner,
  // Session key signing
  createECDSAMessageSigner,
} from '@erc7824/nitrolite'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

// ClearNode WebSocket endpoints
// Based on https://docs.yellow.org/docs/learn/introduction/supported-chains
const CLEARNODE_SANDBOX = 'wss://clearnet-sandbox.yellow.com/ws' // For testing with ytest.usd
const CLEARNODE_PROD = 'wss://clearnet.yellow.com/ws'           // For real assets (usdc)

// Use SANDBOX by default for testing (uses testnet tokens like ytest.usd)
// Set VITE_CLEARNODE_URL in .env to override
const CLEARNODE_URL = import.meta.env.VITE_CLEARNODE_URL || CLEARNODE_SANDBOX

console.log('🌐 Nitrolite ClearNode URL:', CLEARNODE_URL)

// Yellow Network Contract Addresses
// See: https://docs.yellow.org/docs/learn/introduction/supported-chains
export const YELLOW_CONTRACTS = {
  // Sandbox (Testnet) - Same addresses across all sandbox chains
  sandbox: {
    custody: '0x019B65A265EB3363822f2752141b3dF16131b262',
    adjudicator: '0x7c7ccbc98469190849BCC6c926307794fDfB11F2',
  },
  // Per-chain token addresses (for sandbox, all use ytest.usd)
  tokens: {
    // Sepolia ETH (11155111)
    11155111: {
      'ytest.usd': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Test USD token
    },
    // Base Sepolia (84532)  
    84532: {
      'ytest.usd': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    },
    // Polygon Amoy (80002)
    80002: {
      'ytest.usd': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    },
  },
}

// Determine environment from URL
export const IS_SANDBOX = CLEARNODE_URL.includes('sandbox')

// Protocol version for FlashPoint game
const FLASHPOINT_PROTOCOL = 'NitroRPC/0.4'

// Game entry fee in USDC (with 6 decimals)
// 1 USDC = 1000000
export const DEFAULT_ENTRY_FEE = '1000000' // 1 USDC
export const DEFAULT_BET_AMOUNT = DEFAULT_ENTRY_FEE // Alias for compatibility

// Asset name depends on environment
export const ASSET_NAME = IS_SANDBOX ? 'ytest.usd' : 'usdc'

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
    this.sessionSigner = null // ECDSA signer from session key (for app sessions)
    this.sessionKey = null
    this.sessionAccount = null
    this.userAddress = null
    this.appSessionId = null
    this.pendingRequests = new Map()
    this.eventHandlers = new Map()
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.shouldReconnect = true
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
   * Connect to the ClearNode WebSocket server with authentication
   * @param {Object} walletClient - Viem wallet client for EIP712 signing
   * @returns {Promise<void>}
   */
  async connect(walletClient = null) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('🌐 Connecting to Yellow Network ClearNode:', CLEARNODE_URL)
        this.ws = new WebSocket(CLEARNODE_URL)

        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            this.ws?.close()
            reject(new Error('Connection timeout - ClearNode may be unavailable'))
          }
        }, 15000)

        this.ws.onopen = async () => {
          console.log('🔗 WebSocket connected, starting authentication...')
          
          try {
            // Start authentication flow
            await this.authenticate(walletClient)
            
            clearTimeout(timeout)
            this.isConnected = true
            this.reconnectAttempts = 0
            console.log('✅ Authenticated with Yellow Network ClearNode')
            this.emit('connected')
            resolve()
          } catch (authError) {
            clearTimeout(timeout)
            console.error('❌ Authentication failed:', authError.message)
            this.ws?.close()
            reject(authError)
          }
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          clearTimeout(timeout)
          console.error('❌ WebSocket error:', error)
          console.error('   URL:', CLEARNODE_URL)
          this.emit('error', error)
        }

        this.ws.onclose = (event) => {
          clearTimeout(timeout)
          console.log('🔌 WebSocket closed:', event.code, event.reason || '(no reason)')
          this.isConnected = false
          this.emit('disconnected', event)
          
          if (event.code !== 1000) {
            reject(new Error(`Failed to connect to ClearNode (code: ${event.code})`))
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Authenticate with ClearNode using EIP712 signature
   * Based on: https://github.com/erc7824/nitrolite/blob/main/integration/common/auth.ts
   * @param {Object} walletClient - Viem wallet client
   * @returns {Promise<void>}
   */
  async authenticate(walletClient) {
    if (!walletClient) {
      throw new Error('Wallet client required for authentication')
    }
    
    const address = walletClient.account?.address || this.userAddress
    if (!address) {
      throw new Error('Wallet address not available')
    }

    // Generate a session key for this connection
    const sessionKey = generatePrivateKey()
    const sessionAccount = privateKeyToAccount(sessionKey)
    this.sessionKey = sessionKey
    this.sessionAccount = sessionAccount

    console.log('🔑 Starting auth flow:')
    console.log('   Wallet:', address)
    console.log('   Session Key:', sessionAccount.address)

    // Auth request parameters - following SDK format exactly
    // Allowances define the spending cap for the session key
    const authRequestParams = {
      address: address,
      session_key: sessionAccount.address,
      application: 'FlashPoint',  // Must match app session application name
      expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour expiration
      scope: 'console',
      allowances: [
        { asset: ASSET_NAME, amount: '1000000000' }, // Allow up to 1000 USDC/ytest.usd
      ],
    }

    // Create EIP712 message signer for auth_verify
    const eip712MessageSigner = createEIP712AuthMessageSigner(
      walletClient,
      {
        scope: authRequestParams.scope,
        session_key: authRequestParams.session_key,
        expires_at: authRequestParams.expires_at,
        allowances: authRequestParams.allowances,
      },
      {
        name: authRequestParams.application,
      }
    )

    // Step 1: Send auth_request and wait for auth_challenge response
    const authRequestMsg = await createAuthRequestMessage(authRequestParams)
    console.log('📤 Sending auth_request...')
    
    const challengeResponseRaw = await this.sendRawRequest(authRequestMsg, 'auth_challenge')
    console.log('📨 Received auth_challenge:', challengeResponseRaw)

    // Step 2: Parse the challenge
    const parsedChallenge = parseAuthChallengeResponse(challengeResponseRaw)
    console.log('🔐 Challenge message:', parsedChallenge.params.challengeMessage)

    // Step 3: Create and send auth_verify with EIP712 signed challenge
    const authVerifyMsg = await createAuthVerifyMessage(eip712MessageSigner, parsedChallenge)
    console.log('✍️ Sending auth_verify with signed challenge...')
    
    const verifyResponseRaw = await this.sendRawRequest(authVerifyMsg, 'auth_verify')
    console.log('🎉 Auth verified:', verifyResponseRaw)

    // Parse the verify response to get JWT
    try {
      const verifyData = JSON.parse(verifyResponseRaw)
      if (verifyData.res && verifyData.res[2]) {
        const params = verifyData.res[2]
        if (params.jwt_token) {
          this.jwtToken = params.jwt_token
          console.log('✅ JWT token received')
        }
        if (params.success === false) {
          throw new Error('Authentication rejected by server')
        }
      }
    } catch (e) {
      // Ignore parse errors, authentication may still have succeeded
      console.log('⚠️ Could not parse JWT from response, continuing...')
    }
    
    // Create session key signer for app session operations
    // This is the signer that should be used for createAppSessionMessage, etc.
    this.sessionSigner = createECDSAMessageSigner(this.sessionKey)
    console.log('🔐 Session signer created for:', this.sessionAccount.address)
    
    console.log('✅ Authentication complete!')
  }

  /**
   * Send a raw request string and wait for a specific response type
   * @param {string} messageStr - Message string to send
   * @param {string} expectedMethod - Expected response method (e.g., 'auth_challenge')
   * @returns {Promise<string>} Raw response string
   */
  sendRawRequest(messageStr, expectedMethod = null) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws.removeEventListener('message', handler)
        reject(new Error('Request timeout'))
      }, 15000)

      // Message handler that filters for expected response type
      const handler = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Check if this is the response we're waiting for
          if (expectedMethod && data.res && data.res[1] !== expectedMethod) {
            // This is a broadcast message (like 'assets'), ignore it and keep waiting
            console.log(`📨 Ignoring broadcast message: ${data.res[1]}`)
            return
          }
          
          clearTimeout(timeout)
          this.ws.removeEventListener('message', handler)
          resolve(event.data)
        } catch (e) {
          // If we can't parse, still resolve with raw data
          clearTimeout(timeout)
          this.ws.removeEventListener('message', handler)
          resolve(event.data)
        }
      }

      this.ws.addEventListener('message', handler)
      
      console.log('📤 Sending:', messageStr.substring(0, 200) + '...')
      this.ws.send(messageStr)
    })
  }

  /**
   * Stop reconnection attempts
   */
  stopReconnecting() {
    this.shouldReconnect = false
    this.reconnectAttempts = this.maxReconnectAttempts + 1
  }

  /**
   * Attempt to reconnect to the server
   */
  attemptReconnect() {
    if (!this.shouldReconnect) {
      console.log('🛑 Reconnection disabled')
      return
    }
    
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`)
    
    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect().catch(console.error)
      }
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
    if (!this.sessionSigner || !this.userAddress) {
      throw new Error('Client not authenticated. Call connect() with wallet first.')
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
        asset: ASSET_NAME, // 'ytest.usd' for sandbox, 'usdc' for production
        amount: betAmount,
      },
      {
        participant: opponentAddress,
        asset: ASSET_NAME,
        amount: betAmount,
      },
    ]

    // Create the signed message using SESSION KEY signer
    const signedMessage = await createAppSessionMessage(
      this.sessionSigner,
      {
        definition: appDefinition,
        allocations,
      }
    )

    // Send and wait for response
    const response = await this.sendAndWait(signedMessage)
    
    console.log('📨 createGameSession response:', JSON.stringify(response, null, 2))
    
    if (response?.appSessionId) {
      this.appSessionId = response.appSessionId
      console.log('🎮 Game session created:', this.appSessionId)
    } else if (response?.params?.appSessionId) {
      this.appSessionId = response.params.appSessionId
      console.log('🎮 Game session created (from params):', this.appSessionId)
    } else if (response?.error) {
      console.error('❌ ClearNode error:', response.error)
      console.error('   This usually means you need to deposit funds first.')
      console.error('   Run: curl -XPOST https://clearnet-sandbox.yellow.com/faucet/requestTokens -H "Content-Type: application/json" -d \'{"userAddress":"' + this.userAddress + '"}\'')
    }

    return response?.params || response
  }

  /**
   * Create a session proposal for multi-party signing
   * Player 1 calls this to create the proposal, then sends to Player 2 for signing
   * 
   * @param {string} opponentAddress - Opponent's wallet address
   * @param {string} betAmount - Bet amount in USDC (6 decimals)
   * @returns {Promise<Object>} Session proposal with Player 1's signature
   */
  async createSessionProposal(opponentAddress, betAmount = DEFAULT_BET_AMOUNT) {
    if (!this.sessionSigner || !this.userAddress) {
      throw new Error('Client not authenticated. Call connect() with wallet first.')
    }

    // Define the application session parameters
    const appDefinition = {
      protocol: FLASHPOINT_PROTOCOL,
      application: 'FlashPoint',
      participants: [this.userAddress, opponentAddress],
      weights: [50, 50],
      quorum: 100,
      challenge: 0,
      nonce: Date.now(),
    }

    // Initial allocations
    const allocations = [
      {
        participant: this.userAddress,
        asset: ASSET_NAME,
        amount: betAmount,
      },
      {
        participant: opponentAddress,
        asset: ASSET_NAME,
        amount: betAmount,
      },
    ]

    // Create the signed message using SESSION KEY signer (not wallet signer)
    const signedMessage = await createAppSessionMessage(
      this.sessionSigner,
      {
        definition: appDefinition,
        allocations,
      }
    )

    // Parse to get the message object
    const messageObj = JSON.parse(signedMessage)
    
    console.log('📝 Session proposal created:', messageObj)
    
    return {
      message: messageObj,      // The full message object { req, sig }
      request: messageObj.req,  // Just the request data for co-signing
      signature: messageObj.sig[0], // Player 1's signature
    }
  }

  /**
   * Co-sign a session proposal (called by Player 2)
   * 
   * @param {Array} requestData - The req array from the proposal
   * @returns {Promise<string>} Player 2's signature
   */
  async signSessionProposal(requestData) {
    if (!this.sessionSigner) {
      throw new Error('Client not authenticated. Call connect() with wallet first.')
    }

    console.log('✍️ Co-signing session proposal with session key...')
    
    // Sign the request data using SESSION KEY signer
    const signature = await this.sessionSigner(requestData)
    
    console.log('✅ Session proposal signed')
    return signature
  }

  /**
   * Submit a multi-signed session to ClearNode
   * Called by Player 1 after collecting Player 2's signature
   * 
   * @param {Object} message - The original message object { req, sig }
   * @param {string} coSignature - Player 2's signature to append
   * @returns {Promise<Object>} App session details
   */
  async submitMultiSignedSession(message, coSignature) {
    if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to ClearNode')
    }

    // Append the co-signer's signature
    message.sig.push(coSignature)
    
    console.log('📤 Submitting multi-signed session:', message)
    
    // Send and wait for response
    const messageStr = JSON.stringify(message)
    const response = await this.sendAndWait(messageStr)
    
    console.log('📨 Multi-signed session RAW response:', response)
    console.log('📨 Response.raw:', response?.raw)
    console.log('📨 Response.params:', response?.params)
    console.log('📨 Response.method:', response?.method)
    
    // Try to parse using SDK helper
    try {
      if (response?.raw) {
        const rawStr = JSON.stringify(response.raw)
        const parsed = parseCreateAppSessionResponse(rawStr)
        console.log('📨 SDK parsed response:', parsed)
        if (parsed?.appSessionId) {
          this.appSessionId = parsed.appSessionId
          console.log('🎮 Game session created (SDK parsed):', this.appSessionId)
          return parsed
        }
      }
    } catch (parseErr) {
      console.warn('⚠️ SDK parse failed:', parseErr.message)
    }
    
    // Check for error in response
    if (response?.raw?.err) {
      const [reqId, errCode, errMsg] = response.raw.err
      console.error('❌ ClearNode error:', errCode, errMsg)
      throw new Error(`${errCode}: ${errMsg}`)
    }
    
    // Try direct property access
    if (response?.appSessionId) {
      this.appSessionId = response.appSessionId
      console.log('🎮 Game session created:', this.appSessionId)
      return { appSessionId: this.appSessionId, ...response }
    } else if (response?.params?.appSessionId) {
      this.appSessionId = response.params.appSessionId
      console.log('🎮 Game session created (from params):', this.appSessionId)
      return { appSessionId: this.appSessionId, ...response.params }
    } else if (response?.params?.app_session_id) {
      this.appSessionId = response.params.app_session_id
      console.log('🎮 Game session created (from params.app_session_id):', this.appSessionId)
      // Return with camelCase key so GameLobby can find it!
      return { appSessionId: this.appSessionId, ...response.params }
    } else if (response?.error || response?.params?.error) {
      const error = response.error || response.params?.error
      console.error('❌ ClearNode error:', error)
      throw new Error(error)
    }

    return response?.params || response
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
        asset: ASSET_NAME, // 'ytest.usd' for sandbox, 'usdc' for production
        amount: player1Payout.toString(),
      },
      {
        participant: player2Address,
        asset: ASSET_NAME,
        amount: player2Payout.toString(),
      },
    ]

    // Create the signed close message using SESSION KEY signer
    const signedMessage = await createCloseAppSessionMessage(
      this.sessionSigner,
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
    if (!this.appSessionId || !this.sessionSigner) {
      throw new Error('No active game session')
    }

    // Import dynamically to handle different protocol versions
    const { createSubmitAppStateMessage } = await import('@erc7824/nitrolite')

    const signedMessage = await createSubmitAppStateMessage(
      this.sessionSigner,
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
   * Check if connected and authenticated (ready for app sessions)
   * @returns {boolean}
   */
  isReady() {
    return this.isConnected && this.sessionSigner !== null
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
    this.sessionSigner = null
    this.sessionKey = null
    this.sessionAccount = null
    console.log('🔌 Disconnected from ClearNode')
  }
}

// Export singleton instance
export const nitroliteClient = new NitroliteClient()
export default nitroliteClient
