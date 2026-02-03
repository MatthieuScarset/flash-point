/**
 * Yellow Network State Channel Service
 * Handles state channel operations for betting in FlashPoint
 */

// ClearNode WebSocket endpoints
const CLEARNODE_SANDBOX = 'wss://clearnet-sandbox.yellow.com/ws'
const CLEARNODE_PRODUCTION = 'wss://clearnet.yellow.com/ws'

// Use sandbox for development
const CLEARNODE_URL = CLEARNODE_SANDBOX

// Bet amount: 1 USDC (6 decimals)
export const BET_AMOUNT = '1000000'

class YellowNetworkService {
  constructor() {
    this.ws = null
    this.messageSigner = null
    this.userAddress = null
    this.sessionId = null
    this.isConnected = false
    this.messageHandlers = new Map()
    this.pendingRequests = new Map()
  }

  /**
   * Initialize wallet connection and message signer
   */
  async setupWallet() {
    if (!window.ethereum) {
      throw new Error('Please install MetaMask or another Web3 wallet')
    }

    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    })

    this.userAddress = accounts[0]

    // Create message signer function
    this.messageSigner = async (message) => {
      return await window.ethereum.request({
        method: 'personal_sign',
        params: [message, this.userAddress]
      })
    }

    console.log('✅ Wallet connected:', this.userAddress)
    return this.userAddress
  }

  /**
   * Connect to Yellow Network ClearNode
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(CLEARNODE_URL)

        this.ws.onopen = () => {
          console.log('🟢 Connected to Yellow Network!')
          this.isConnected = true
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          console.error('❌ Yellow Network connection error:', error)
          this.isConnected = false
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('🔴 Disconnected from Yellow Network')
          this.isConnected = false
        }

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'))
          }
        }, 10000)

      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data)
      console.log('📨 Yellow Network message:', message)

      switch (message.type) {
        case 'session_created':
          this.sessionId = message.sessionId
          console.log('✅ Session created:', this.sessionId)
          this.emit('session_created', message)
          break

        case 'payment':
          console.log('💰 Payment received:', message.amount)
          this.emit('payment', message)
          break

        case 'settlement':
          console.log('💸 Settlement completed:', message)
          this.emit('settlement', message)
          break

        case 'error':
          console.error('❌ Yellow Network error:', message.error)
          this.emit('error', message)
          break

        default:
          this.emit('message', message)
      }

      // Resolve any pending requests
      if (message.requestId && this.pendingRequests.has(message.requestId)) {
        const { resolve } = this.pendingRequests.get(message.requestId)
        this.pendingRequests.delete(message.requestId)
        resolve(message)
      }
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }

  /**
   * Create a game session (state channel) for betting
   */
  async createGameSession(opponentAddress, betAmount = BET_AMOUNT) {
    if (!this.isConnected || !this.messageSigner) {
      throw new Error('Not connected or wallet not setup')
    }

    const appDefinition = {
      protocol: 'flashpoint-game-v1',
      participants: [this.userAddress, opponentAddress],
      weights: [50, 50], // Equal participation
      quorum: 100, // Both participants must agree
      challenge: 0,
      nonce: Date.now()
    }

    // Initial allocations - both players lock their bet
    const allocations = [
      { participant: this.userAddress, asset: 'usdc', amount: betAmount },
      { participant: opponentAddress, asset: 'usdc', amount: betAmount }
    ]

    const sessionData = {
      type: 'create_session',
      definition: appDefinition,
      allocations,
      timestamp: Date.now()
    }

    // Sign the session creation
    const signature = await this.messageSigner(JSON.stringify(sessionData))

    const message = {
      ...sessionData,
      signature,
      sender: this.userAddress
    }

    return this.sendAndWait(message)
  }

  /**
   * Submit game result and settle the state channel
   */
  async settleGame(gameId, player1Score, player2Score) {
    if (!this.isConnected || !this.sessionId) {
      throw new Error('No active session')
    }

    const totalScore = player1Score + player2Score
    const totalPot = BigInt(BET_AMOUNT) * 2n
    const fee = totalPot * 2n / 100n // 2% protocol fee
    const distributablePot = totalPot - fee

    // Calculate payouts proportional to scores
    let player1Payout, player2Payout

    if (totalScore === 0) {
      // Both scored 0, split evenly
      player1Payout = distributablePot / 2n
      player2Payout = distributablePot / 2n
    } else {
      player1Payout = (distributablePot * BigInt(player1Score)) / BigInt(totalScore)
      player2Payout = (distributablePot * BigInt(player2Score)) / BigInt(totalScore)
    }

    const settlementData = {
      type: 'settle',
      sessionId: this.sessionId,
      gameId,
      results: {
        player1Score,
        player2Score,
        player1Payout: player1Payout.toString(),
        player2Payout: player2Payout.toString(),
        fee: fee.toString()
      },
      timestamp: Date.now()
    }

    const signature = await this.messageSigner(JSON.stringify(settlementData))

    const message = {
      ...settlementData,
      signature,
      sender: this.userAddress
    }

    return this.sendAndWait(message)
  }

  /**
   * Send message and wait for response
   */
  sendAndWait(message, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      message.requestId = requestId

      this.pendingRequests.set(requestId, { resolve, reject })

      this.ws.send(JSON.stringify(message))

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId)
          reject(new Error('Request timeout'))
        }
      }, timeout)
    })
  }

  /**
   * Event emitter helpers
   */
  on(event, handler) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, [])
    }
    this.messageHandlers.get(event).push(handler)
  }

  off(event, handler) {
    if (this.messageHandlers.has(event)) {
      const handlers = this.messageHandlers.get(event)
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  emit(event, data) {
    if (this.messageHandlers.has(event)) {
      this.messageHandlers.get(event).forEach(handler => handler(data))
    }
  }

  /**
   * Disconnect from Yellow Network
   */
  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.sessionId = null
  }

  /**
   * Get proof of bet placement for matchmaking server
   */
  async getBetProof(betAmount = BET_AMOUNT) {
    const betData = {
      type: 'bet_commitment',
      amount: betAmount,
      asset: 'usdc',
      timestamp: Date.now(),
      address: this.userAddress
    }

    const signature = await this.messageSigner(JSON.stringify(betData))

    return {
      ...betData,
      signature
    }
  }
}

// Singleton instance
export const yellowNetwork = new YellowNetworkService()
export default yellowNetwork
