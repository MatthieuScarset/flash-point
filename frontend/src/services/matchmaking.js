import { io } from 'socket.io-client'

const MATCHMAKING_SERVER = 'http://localhost:3001'

class MatchmakingService {
  constructor() {
    this.socket = null
    this.isConnected = false
    this.currentGameId = null
    this.playerNumber = null
    this.isMyTurn = false
    this.eventHandlers = new Map()
  }

  /**
   * Connect to the matchmaking server
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(MATCHMAKING_SERVER, {
          transports: ['websocket', 'polling']
        })

        this.socket.on('connect', () => {
          console.log('🎮 Connected to matchmaking server')
          this.isConnected = true
          resolve()
        })

        this.socket.on('connect_error', (error) => {
          console.error('❌ Matchmaking connection error:', error)
          this.isConnected = false
          reject(error)
        })

        this.socket.on('disconnect', () => {
          console.log('🔌 Disconnected from matchmaking server')
          this.isConnected = false
          this.emit('disconnected')
        })

        // Game events
        this.socket.on('waiting_for_opponent', (data) => {
          console.log('⏳ Waiting for partner:', data)
          this.emit('waiting', data)
        })

        this.socket.on('match_found', (data) => {
          console.log('🎉 Partner found!', data)
          this.currentGameId = data.gameId
          this.emit('match_found', data)
        })

        this.socket.on('game_start', (data) => {
          console.log('🚀 Game starting!', data)
          this.currentGameId = data.gameId
          this.playerNumber = data.playerNumber
          this.isMyTurn = data.isYourTurn
          this.emit('game_start', data)
        })

        // Collaborative mode events
        this.socket.on('block_spawned', (data) => {
          console.log('🧱 Block spawned:', data)
          this.emit('block_spawned', data)
        })

        this.socket.on('turn_changed', (data) => {
          console.log('🔄 Turn changed:', data)
          this.isMyTurn = data.isYourTurn
          this.emit('turn_changed', data)
        })

        this.socket.on('block_position_update', (data) => {
          this.emit('block_position_update', data)
        })

        this.socket.on('game_state_sync', (data) => {
          this.emit('game_state_sync', data)
        })

        this.socket.on('opponent_score', (data) => {
          this.emit('opponent_score', data)
        })

        this.socket.on('opponent_disconnected', (data) => {
          console.log('👋 Partner disconnected:', data)
          this.emit('opponent_disconnected', data)
        })

        this.socket.on('game_result', (data) => {
          console.log('🏆 Game result:', data)
          this.emit('game_result', data)
        })

        this.socket.on('left_lobby', (data) => {
          console.log('👋 Left lobby:', data)
          this.emit('left_lobby', data)
        })

        this.socket.on('error', (data) => {
          console.error('❌ Game error:', data)
          this.emit('error', data)
        })

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'))
          }
        }, 5000)

      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Join lobby to find a partner
   */
  joinLobby(modeId, address, stateChannelProof = null) {
    if (!this.isConnected) {
      throw new Error('Not connected to matchmaking server')
    }

    this.socket.emit('join_lobby', {
      modeId,
      address,
      stateChannelProof
    })
  }

  /**
   * Leave the lobby
   */
  leaveLobby(modeId) {
    if (this.socket) {
      this.socket.emit('leave_lobby', { modeId })
    }
  }

  /**
   * Spawn a block (collaborative mode)
   */
  spawnBlock(block) {
    if (this.socket && this.currentGameId) {
      this.socket.emit('spawn_block', {
        gameId: this.currentGameId,
        block
      })
    }
  }

  /**
   * End current turn and send final block states
   */
  endTurn(blockStates) {
    if (this.socket && this.currentGameId) {
      this.socket.emit('end_turn', {
        gameId: this.currentGameId,
        blockStates
      })
      this.isMyTurn = false
    }
  }

  /**
   * Sync block position in real-time while dragging
   */
  syncBlockPosition(blockId, x, y, angle) {
    if (this.socket && this.currentGameId && this.isMyTurn) {
      this.socket.emit('sync_block_position', {
        gameId: this.currentGameId,
        blockId,
        x,
        y,
        angle
      })
    }
  }

  /**
   * Sync full game state
   */
  syncGameState(blockStates) {
    if (this.socket && this.currentGameId && this.isMyTurn) {
      this.socket.emit('sync_game_state', {
        gameId: this.currentGameId,
        blockStates
      })
    }
  }

  /**
   * Send score update during gameplay
   */
  updateScore(score) {
    if (this.socket && this.currentGameId) {
      this.socket.emit('update_score', {
        gameId: this.currentGameId,
        score
      })
    }
  }

  /**
   * Report game end with final score
   */
  endGame(finalScore) {
    if (this.socket && this.currentGameId) {
      this.socket.emit('game_end', {
        gameId: this.currentGameId,
        finalScore
      })
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.isConnected = false
    this.currentGameId = null
    this.playerNumber = null
    this.isMyTurn = false
  }

  /**
   * Event emitter helpers
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event).push(handler)
  }

  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event)
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => handler(data))
    }
  }
}

// Singleton instance
export const matchmaking = new MatchmakingService()
export default matchmaking
