import { io } from 'socket.io-client'

const MATCHMAKING_SERVER = 'http://localhost:3001'

class MatchmakingService {
  constructor() {
    this.socket = null
    this.isConnected = false
    this.currentGameId = null
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
          console.log('⏳ Waiting for opponent:', data)
          this.emit('waiting', data)
        })

        this.socket.on('match_found', (data) => {
          console.log('🎉 Match found!', data)
          this.currentGameId = data.gameId
          this.emit('match_found', data)
        })

        this.socket.on('game_start', (data) => {
          console.log('🚀 Game starting!', data)
          this.currentGameId = data.gameId
          this.emit('game_start', data)
        })

        this.socket.on('opponent_score', (data) => {
          this.emit('opponent_score', data)
        })

        this.socket.on('opponent_disconnected', (data) => {
          console.log('👋 Opponent disconnected:', data)
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
   * Join lobby to find an opponent
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
