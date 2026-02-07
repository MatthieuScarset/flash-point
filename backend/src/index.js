import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'

const app = express()
app.use(cors())
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
})

// Game state
const lobbies = new Map() // modeId -> { players: [], createdAt }
const activeGames = new Map() // gameId -> { player1, player2, modeId, state, bets, gameState }
const playerSockets = new Map() // socketId -> { address, gameId, modeId }

// Bet amount in USDC (1 USDC = 1,000,000 units with 6 decimals)
const BET_AMOUNT = '1000000' // 1 USDC

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', lobbies: lobbies.size, activeGames: activeGames.size })
})

io.on('connection', (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`)

  // Player joins lobby to find a match
  socket.on('join_lobby', ({ modeId, address, stateChannelProof }) => {
    console.log(`👤 Player ${address} joining lobby for mode: ${modeId}`)
    
    // Store player info
    playerSockets.set(socket.id, { address, modeId })
    
    // Get or create lobby for this mode
    if (!lobbies.has(modeId)) {
      lobbies.set(modeId, { players: [], createdAt: Date.now() })
    }
    
    const lobby = lobbies.get(modeId)
    
    // Check if there's already a player waiting
    if (lobby.players.length > 0) {
      // Match found! Create a game
      const opponent = lobby.players.shift()
      const gameId = uuidv4()
      
      // Create the game with shared state
      const game = {
        id: gameId,
        modeId,
        player1: {
          socketId: opponent.socketId,
          address: opponent.address,
          stateChannelProof: opponent.stateChannelProof,
          score: 0
        },
        player2: {
          socketId: socket.id,
          address,
          stateChannelProof,
          score: 0
        },
        betAmount: BET_AMOUNT,
        status: 'starting',
        createdAt: Date.now(),
        // Shared game state for collaborative mode
        gameState: {
          blocks: [], // Array of block states { id, x, y, angle, label }
          currentTurn: 1, // Player 1 starts
          turnCount: 0,
          spawnedBlocks: 0
        }
      }
      
      activeGames.set(gameId, game)
      
      // Update player socket mappings
      playerSockets.set(opponent.socketId, { ...playerSockets.get(opponent.socketId), gameId })
      playerSockets.set(socket.id, { address, modeId, gameId })
      
      // Join both players to a room
      socket.join(gameId)
      io.sockets.sockets.get(opponent.socketId)?.join(gameId)
      
      console.log(`🎮 Match found! Game ${gameId} starting...`)
      
      // Notify both players
      io.to(gameId).emit('match_found', {
        gameId,
        modeId,
        players: [
          { address: opponent.address, isYou: false },
          { address, isYou: false }
        ],
        betAmount: BET_AMOUNT
      })
      
      // Send personalized messages with initial game state
      io.to(opponent.socketId).emit('game_start', {
        gameId,
        modeId,
        opponent: { address },
        betAmount: BET_AMOUNT,
        playerNumber: 1,
        isYourTurn: true, // Player 1 starts
        gameState: game.gameState
      })
      
      socket.emit('game_start', {
        gameId,
        modeId,
        opponent: { address: opponent.address },
        betAmount: BET_AMOUNT,
        playerNumber: 2,
        isYourTurn: false, // Player 2 waits
        gameState: game.gameState
      })
      
    } else {
      // No opponent yet, add to lobby
      lobby.players.push({
        socketId: socket.id,
        address,
        stateChannelProof,
        joinedAt: Date.now()
      })
      
      console.log(`⏳ Player ${address} waiting in lobby. Queue size: ${lobby.players.length}`)
      
      socket.emit('waiting_for_opponent', {
        modeId,
        position: lobby.players.length,
        estimatedWait: '~30 seconds'
      })
    }
  })

  // Player spawns a block (collaborative mode)
  socket.on('spawn_block', ({ gameId, block }) => {
    const game = activeGames.get(gameId)
    if (!game) return
    
    const playerNumber = game.player1.socketId === socket.id ? 1 : 2
    
    // Verify it's this player's turn
    if (game.gameState.currentTurn !== playerNumber) {
      socket.emit('error', { message: 'Not your turn!' })
      return
    }
    
    // Add block to game state
    game.gameState.blocks.push(block)
    game.gameState.spawnedBlocks++
    
    console.log(`🧱 Player ${playerNumber} spawned block in game ${gameId}`)
    
    // Broadcast the spawn to both players
    io.to(gameId).emit('block_spawned', {
      block,
      spawnedBy: playerNumber,
      totalBlocks: game.gameState.spawnedBlocks
    })
  })

  // Player finishes their turn (after placing/dragging block)
  socket.on('end_turn', ({ gameId, blockStates }) => {
    const game = activeGames.get(gameId)
    if (!game) return
    
    const playerNumber = game.player1.socketId === socket.id ? 1 : 2
    
    // Verify it's this player's turn
    if (game.gameState.currentTurn !== playerNumber) {
      return
    }
    
    // Update the shared block states
    game.gameState.blocks = blockStates
    game.gameState.turnCount++
    
    // Switch turns
    game.gameState.currentTurn = playerNumber === 1 ? 2 : 1
    
    console.log(`🔄 Turn ended. Now player ${game.gameState.currentTurn}'s turn in game ${gameId}`)
    
    // Notify both players of the turn change and updated state
    io.to(game.player1.socketId).emit('turn_changed', {
      currentTurn: game.gameState.currentTurn,
      isYourTurn: game.gameState.currentTurn === 1,
      blockStates,
      turnCount: game.gameState.turnCount
    })
    
    io.to(game.player2.socketId).emit('turn_changed', {
      currentTurn: game.gameState.currentTurn,
      isYourTurn: game.gameState.currentTurn === 2,
      blockStates,
      turnCount: game.gameState.turnCount
    })
  })

  // Real-time block position sync (while dragging)
  socket.on('sync_block_position', ({ gameId, blockId, x, y, angle }) => {
    const game = activeGames.get(gameId)
    if (!game) return
    
    // Broadcast to the other player only
    socket.to(gameId).emit('block_position_update', {
      blockId,
      x,
      y,
      angle
    })
  })

  // Sync all block states periodically
  socket.on('sync_game_state', ({ gameId, blockStates }) => {
    const game = activeGames.get(gameId)
    if (!game) return
    
    const playerNumber = game.player1.socketId === socket.id ? 1 : 2
    
    // Only the current turn player can sync state
    if (game.gameState.currentTurn !== playerNumber) {
      return
    }
    
    // Update game state
    game.gameState.blocks = blockStates
    
    // Broadcast to the other player
    socket.to(gameId).emit('game_state_sync', {
      blockStates,
      fromPlayer: playerNumber
    })
  })

  // Player leaves lobby
  socket.on('leave_lobby', ({ modeId }) => {
    const playerInfo = playerSockets.get(socket.id)
    if (!playerInfo) return
    
    const lobby = lobbies.get(modeId)
    if (lobby) {
      lobby.players = lobby.players.filter(p => p.socketId !== socket.id)
      console.log(`👋 Player left lobby. Queue size: ${lobby.players.length}`)
    }
    
    socket.emit('left_lobby', { modeId })
  })

  // Game score update (during gameplay)
  socket.on('update_score', ({ gameId, score }) => {
    const game = activeGames.get(gameId)
    if (!game) return
    
    if (game.player1.socketId === socket.id) {
      game.player1.score = score
    } else if (game.player2.socketId === socket.id) {
      game.player2.score = score
    }
    
    // Broadcast score to opponent
    socket.to(gameId).emit('opponent_score', { score })
  })

  // Game ended
  socket.on('game_end', ({ gameId, finalScore }) => {
    const game = activeGames.get(gameId)
    if (!game) return
    
    // Update final score
    if (game.player1.socketId === socket.id) {
      game.player1.score = finalScore
      game.player1.finished = true
    } else if (game.player2.socketId === socket.id) {
      game.player2.score = finalScore
      game.player2.finished = true
    }
    
    // Check if both players finished
    if (game.player1.finished && game.player2.finished) {
      // Calculate winner
      const p1Score = game.player1.score
      const p2Score = game.player2.score
      const totalScore = p1Score + p2Score
      
      // Calculate payout ratios (proportional to scores)
      const p1Ratio = totalScore > 0 ? p1Score / totalScore : 0.5
      const p2Ratio = totalScore > 0 ? p2Score / totalScore : 0.5
      
      const totalPot = BigInt(BET_AMOUNT) * 2n
      const fee = totalPot * 2n / 100n // 2% fee
      const distributablePot = totalPot - fee
      
      const p1Payout = (distributablePot * BigInt(Math.floor(p1Ratio * 1000))) / 1000n
      const p2Payout = (distributablePot * BigInt(Math.floor(p2Ratio * 1000))) / 1000n
      
      const result = {
        gameId,
        player1: {
          address: game.player1.address,
          score: p1Score,
          payout: p1Payout.toString()
        },
        player2: {
          address: game.player2.address,
          score: p2Score,
          payout: p2Payout.toString()
        },
        winner: p1Score > p2Score ? game.player1.address : 
                p2Score > p1Score ? game.player2.address : 'tie',
        fee: fee.toString()
      }
      
      console.log(`🏆 Game ${gameId} finished!`, result)
      
      // Notify both players
      io.to(gameId).emit('game_result', result)
      
      // Clean up
      game.status = 'completed'
      game.result = result
      
      // Remove from active games after delay
      setTimeout(() => {
        activeGames.delete(gameId)
      }, 60000)
    }
  })

  // Handle disconnection
  socket.on('disconnect', () => {
    const playerInfo = playerSockets.get(socket.id)
    if (!playerInfo) return
    
    console.log(`🔌 Player disconnected: ${socket.id}`)
    
    // Remove from lobby if waiting
    if (playerInfo.modeId) {
      const lobby = lobbies.get(playerInfo.modeId)
      if (lobby) {
        lobby.players = lobby.players.filter(p => p.socketId !== socket.id)
      }
    }
    
    // Handle active game disconnection
    if (playerInfo.gameId) {
      const game = activeGames.get(playerInfo.gameId)
      if (game && game.status !== 'completed') {
        game.status = 'abandoned'
        
        // Notify opponent
        socket.to(playerInfo.gameId).emit('opponent_disconnected', {
          gameId: playerInfo.gameId,
          message: 'Your opponent disconnected. You win!'
        })
      }
    }
    
    playerSockets.delete(socket.id)
  })
})

// Clean up stale lobbies every minute
setInterval(() => {
  const now = Date.now()
  const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes
  
  for (const [modeId, lobby] of lobbies.entries()) {
    lobby.players = lobby.players.filter(p => now - p.joinedAt < STALE_THRESHOLD)
    if (lobby.players.length === 0) {
      lobbies.delete(modeId)
    }
  }
}, 60000)

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  console.log(`🚀 FlashPoint matchmaking server running on port ${PORT}`)
  console.log(`   WebSocket: ws://localhost:${PORT}`)
  console.log(`   Health: http://localhost:${PORT}/health`)
})
