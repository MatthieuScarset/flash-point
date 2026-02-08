import React, { useEffect, useRef, useState, useCallback } from 'react'
import Matter from 'matter-js'
import yaml from 'js-yaml'
import Homepage from './components/Homepage'
import GameLobby from './components/GameLobby'
import { matchmaking } from './services/matchmaking'
import './style.css'

const Bodies = Matter.Bodies
const Composite = Matter.Composite

const BLOCK_DEFAULT_RADIUS = 18
const BLOCK_DEFAULT_WIDTH = 32
const BLOCK_DEFAULT_HEIGHT = 32

// Generate a unique sync ID for multiplayer block synchronization
const generateSyncId = () => {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const createBlock = (blockConfig, position, syncId = null) => {
  const { x, y } = position
  const commonProperties = {
    friction: blockConfig.friction,
    restitution: blockConfig.restitution,
    render: blockConfig.render
  }

  let body
  if (blockConfig.shape === 'rectangle') {
    const w = blockConfig.width || BLOCK_DEFAULT_WIDTH
    const h = blockConfig.height || BLOCK_DEFAULT_HEIGHT
    body = Bodies.rectangle(x, y, w, h, commonProperties)
  } else {
    // polygon (use sides and radius with fallback)
    const sides = blockConfig.sides || 6
    const radius = blockConfig.radius || BLOCK_DEFAULT_RADIUS
    body = Bodies.polygon(x, y, sides, radius, commonProperties)
  }

  // Tag the body with a block id/label (used for level checks)
  body.label = blockConfig.label || blockConfig.shape
  // Add custom sync ID for multiplayer synchronization
  body.syncId = syncId || generateSyncId()
  return body
}


function App() {
  const sceneRef = useRef(null)
  const engineRef = useRef(null)
  const levelTimerRef = useRef(null)
  const sessionTimerRef = useRef(null)
  const mouseConstraintRef = useRef(null)
  const [gameConfig, setGameConfig] = useState(null)
  const [activeMode, setActiveMode] = useState(null)
  const [levels, setLevels] = useState([])
  const [activeLevelId, setActiveLevelId] = useState(null)
  const [activeLevel, setActiveLevel] = useState(null)
  const [levelState, setLevelState] = useState({ started: false, remainingTime: null, status: 'idle' })
  const [sessionTime, setSessionTime] = useState(null) // session countdown timer
  const [currentView, setCurrentView] = useState('homepage') // 'homepage', 'lobby', or 'game'
  const [lobbyData, setLobbyData] = useState(null) // { modeId, modeName }
  const [multiplayerGame, setMultiplayerGame] = useState(null) // game data from matchmaking
  const [spawnedBlocks, setSpawnedBlocks] = useState(0) // track spawned blocks for max limit
  const [draggedBody, setDraggedBody] = useState(null) // currently dragged block
  const [gameResult, setGameResult] = useState(null) // { score, status: 'won' | 'completed' }
  
  // Collaborative multiplayer state
  const [isMyTurn, setIsMyTurn] = useState(true) // whose turn it is
  const [playerNumber, setPlayerNumber] = useState(null) // 1 or 2
  const [partnerAddress, setPartnerAddress] = useState(null) // partner's wallet address
  const [turnCount, setTurnCount] = useState(0) // total turns taken
  const blockBodiesRef = useRef(new Map()) // Map blockId -> Matter.Body for syncing

  // 1. Load the full strategy config
  useEffect(() => {
    fetch('/configs/strategy.yaml')
      .then((response) => response.text())
      .then((text) => {
        const fullConfig = yaml.load(text)
        setGameConfig(fullConfig)
        
        // Find and set the active game mode
        const mode = fullConfig.game_modes.find(m => m.id === fullConfig.active_game_mode)
        setActiveMode(mode)
      })
  }, [])

  // Load levels config (optional)
  useEffect(() => {
    fetch('/configs/levels.yaml')
      .then((res) => res.text())
      .then((text) => {
        try {
          const parsed = yaml.load(text)
          const loaded = parsed && parsed.levels ? parsed.levels : []
          setLevels(loaded)
          if (loaded && loaded[0]) {
            setActiveLevelId(loaded[0].id)
            setActiveLevel(loaded[0])
          }
        } catch (e) {
          console.warn('Failed to parse levels.yaml', e)
        }
      }).catch(() => {
        // no levels file — that's fine
      })
  }, [])

  // Handle starting a solo game from homepage
  const handleStartGame = (modeId) => {
    const mode = gameConfig.game_modes.find(m => m.id === modeId)
    if (mode) {
      setActiveMode(mode)
      setMultiplayerGame(null)
      setIsMyTurn(true) // Start with player's turn in training mode
      setPlayerNumber(1)
      setTurnCount(0)
      setCurrentView('game')
    }
  }

  // Handle starting multiplayer game (opens lobby)
  const handleStartMultiplayer = (modeId, modeName) => {
    setLobbyData({ modeId, modeName })
    setCurrentView('lobby')
  }

  // Handle when multiplayer match is found and game starts
  const handleMultiplayerGameStart = (gameData) => {
    const mode = gameConfig.game_modes.find(m => m.id === gameData.modeId)
    if (mode) {
      setActiveMode(mode)
      setMultiplayerGame(gameData)
      setPlayerNumber(gameData.playerNumber)
      setIsMyTurn(gameData.isYourTurn)
      setPartnerAddress(gameData.opponent?.address)
      setLobbyData(null)
      setCurrentView('game')
    }
  }

  // Handle canceling lobby
  const handleCancelLobby = () => {
    setLobbyData(null)
    setCurrentView('homepage')
  }

  // Go back to homepage
  const handleBackToHome = () => {
    setCurrentView('homepage')
    setMultiplayerGame(null)
    setLobbyData(null)
    setSpawnedBlocks(0)
    setSessionTime(null)
    setGameResult(null)
    setIsMyTurn(true)
    setPlayerNumber(null)
    setPartnerAddress(null)
    setTurnCount(0)
    blockBodiesRef.current.clear()
    setLevelState({ started: false, remainingTime: null, status: 'idle' })
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current)
      levelTimerRef.current = null
    }
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
    // Disconnect from matchmaking if in multiplayer
    if (multiplayerGame) {
      matchmaking.disconnect()
    }
  }

  // 2. Setup Matter.js world based on the active mode
  useEffect(() => {
    if (!activeMode || !gameConfig || currentView !== 'game') return

    // Matter.js setup
    const Engine = Matter.Engine
    const Render = Matter.Render
    const Runner = Matter.Runner

    const engine = Engine.create()
    engineRef.current = engine
    const world = engine.world

    const container = sceneRef.current
    // Portrait aspect (taller than wide)
    const ASPECT = 9 / 16

    const getSize = () => {
      const maxWidth = Math.min(360, Math.round(window.innerWidth * 0.6))
      const width = container.clientWidth || maxWidth || 320
      let height = container.clientHeight || 0

      // If height isn't available (sometimes until CSS resolves), derive it from width and aspect
      if (!height || height === 0) {
        height = Math.round(width / ASPECT)
        const maxH = Math.round(window.innerHeight * 0.9)
        height = Math.min(height, maxH)
      }

      return { width, height }
    }
    const size = getSize()

    const render = Render.create({
      element: container,
      engine: engine,
      options: {
        width: size.width,
        height: size.height,
        wireframes: false,
        background: 'transparent'
      }
    })

    // helper to set physical canvas size so physics coords match the visible scene
    const setRenderSize = (width, height) => {
      const ratio = window.devicePixelRatio || 1
      // internal canvas uses device pixel ratio so 1 physics unit === 1 css px
      const pixelWidth = Math.max(200, Math.round(width * ratio))
      const pixelHeight = Math.max(400, Math.round(height * ratio))

      render.options.width = width
      render.options.height = height
      render.bounds.max.x = width
      render.bounds.max.y = height

      // set the internal canvas bitmap size to match device pixels
      render.canvas.width = pixelWidth
      render.canvas.height = pixelHeight

      // reset transform and scale context so drawing maps 1:1 to CSS pixels
      if (render.context && render.context.setTransform) {
        render.context.setTransform(ratio, 0, 0, ratio, 0, 0)
      }

      // Make the canvas fill the scene container (CSS controls final width/height)
      render.canvas.style.width = `${width}px`
      render.canvas.style.height = `${height}px`
      render.canvas.style.display = 'block'
    }

    setRenderSize(size.width, size.height)

    // Height goal lines configuration (tower height thresholds for rewards)
    const heightGoals = [
      { height: 100, color: '#C0C0C0', label: '100px - Great (1.2x)', dashPattern: [8, 4] },
      { height: 200, color: '#FFD700', label: '200px - Epic (1.5x)', dashPattern: [12, 4] },
      { height: 300, color: '#FF6B6B', label: '300px - Legendary (2x)', dashPattern: [16, 4] },
    ]

    // Draw height goal lines after each render frame
    const drawHeightGoals = () => {
      const ctx = render.context
      const { width, height } = render.options
      const groundH = Math.max(20, Math.round(height * 0.06))
      const groundY = height - groundH

      ctx.save()
      ctx.font = '10px Inter, system-ui, sans-serif'
      ctx.textAlign = 'right'

      heightGoals.forEach(goal => {
        const lineY = groundY - goal.height

        // Only draw if the line is visible (above 0)
        if (lineY > 0) {
          // Draw dashed line
          ctx.beginPath()
          ctx.setLineDash(goal.dashPattern)
          ctx.strokeStyle = goal.color
          ctx.lineWidth = 1.5
          ctx.globalAlpha = 0.6
          ctx.moveTo(0, lineY)
          ctx.lineTo(width, lineY)
          ctx.stroke()
          ctx.setLineDash([])

          // Draw label background
          const labelText = goal.label
          const textMetrics = ctx.measureText(labelText)
          const padding = 4
          const labelWidth = textMetrics.width + padding * 2
          const labelHeight = 14

          ctx.globalAlpha = 0.8
          ctx.fillStyle = '#0a1020'
          ctx.fillRect(width - labelWidth - 4, lineY - labelHeight / 2 - 1, labelWidth, labelHeight)

          // Draw label text
          ctx.globalAlpha = 1
          ctx.fillStyle = goal.color
          ctx.fillText(labelText, width - 6, lineY + 3)
        }
      })

      ctx.restore()
    }

    Matter.Events.on(render, 'afterRender', drawHeightGoals)

    Render.run(render)
    const runner = Runner.create()
    Runner.run(runner, engine)

    // Add ground and walls (kept as variables so we can rebuild on resize)
    const groundHeight = Math.max(20, Math.round(size.height * 0.06))
    const groundY = size.height - Math.round(groundHeight / 2)

    // place the ground so its top edge sits slightly above the bottom of the visible scene
    let ground = Bodies.rectangle(size.width / 2, groundY, size.width, groundHeight, { isStatic: true, render: { fillStyle: '#2b2f35', strokeStyle: '#6ea0d6', lineWidth: 2 } })
    let topWall = Bodies.rectangle(size.width / 2, -10, size.width * 2, 20, { isStatic: true, render: { visible: false } })
    let leftWall = Bodies.rectangle(-10, size.height / 2, 20, size.height * 2, { isStatic: true, render: { visible: false } })
    let rightWall = Bodies.rectangle(size.width + 10, size.height / 2, 20, size.height * 2, { isStatic: true, render: { visible: false } })
    Composite.add(world, [ground, topWall, leftWall, rightWall])

    // Add mouse control (attach to the canvas and support devicePixelRatio)
    const mouse = Matter.Mouse.create(render.canvas)
    // Set pixelRatio to match the canvas scaling
    mouse.pixelRatio = window.devicePixelRatio || 1
    
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: { stiffness: 0.2, render: { visible: false } }
    })
    mouseConstraintRef.current = mouseConstraint
    Composite.add(world, mouseConstraint)

    // Keep render.mouse in sync so Matter.js can properly map mouse coordinates
    render.mouse = mouse

    // Drag events (use stable handler functions so we can remove them on cleanup)
    const onStartDrag = (event) => {
      setDraggedBody(event.body)
    }

    const onEndDrag = (event) => {
      setDraggedBody(null)
    }

    Matter.Events.on(mouseConstraint, 'startdrag', onStartDrag)
    Matter.Events.on(mouseConstraint, 'enddrag', onEndDrag)

    // Resize handler to keep everything in sync
    const handleResize = () => {
      if (!sceneRef.current) return
      const { width, height } = getSize()
      setRenderSize(width, height)

      // rebuild bounds/walls
      Composite.remove(world, [ground, topWall, leftWall, rightWall])
      ground = Bodies.rectangle(width / 2, height - 30, width, 60, { isStatic: true, render: { fillStyle: '#222', strokeStyle: '#555', lineWidth: 4 } })
      topWall = Bodies.rectangle(width / 2, -10, width * 2, 20, { isStatic: true, render: { visible: false } })
      leftWall = Bodies.rectangle(-10, height / 2, 20, height * 2, { isStatic: true, render: { visible: false } })
      rightWall = Bodies.rectangle(width + 10, height / 2, 20, height * 2, { isStatic: true, render: { visible: false } })
      Composite.add(world, [ground, topWall, leftWall, rightWall])

      // Update mouse element reference
      mouse.element = render.canvas
    }

    window.addEventListener('resize', handleResize)
    // run once to ensure everything is positioned correctly
    setTimeout(handleResize, 0)
    
    // 3. Implement Start Conditions (positions can be percentages relative to scene size)
    if (activeMode.start_condition && gameConfig.start_conditions[activeMode.start_condition]) {
      const startCondition = gameConfig.start_conditions[activeMode.start_condition];

      const resolvePosition = (pos) => {
        // pos.x or pos.y may be a number or a percentage string like '35%'
        const { width, height } = getSize()
        const resolve = (v, axisSize) => {
          if (typeof v === 'string' && v.trim().endsWith('%')) {
            const pct = parseFloat(v) / 100
            return Math.round(pct * axisSize)
          }
          return Number(v)
        }
        const rawX = resolve(pos.x, width)
        const rawY = resolve(pos.y, height)
        const padding = 12
        const clamp = (val, min, max) => Math.min(max, Math.max(min, val))

        // ensure y is placed above the ground
        const groundH = Math.max(20, Math.round(height * 0.06))
        const x = clamp(rawX, padding, width - padding)
        const y = clamp(rawY, padding, height - groundH - padding)
        return { x, y }
      }

      startCondition.forEach((startBlock, index) => {
        const blockConfig = gameConfig.block_library[startBlock.block_id];
        if (blockConfig && startBlock.position) {
          const position = resolvePosition(startBlock.position)
          // Use deterministic syncId for start blocks so both players have matching IDs
          const startSyncId = `start_block_${index}_${startBlock.block_id}`
          const block = createBlock(blockConfig, position, startSyncId);
          Composite.add(world, block);
        }
      });
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      Matter.Events.off(mouseConstraint, 'startdrag', onStartDrag)
      Matter.Events.off(mouseConstraint, 'enddrag', onEndDrag)
      Matter.Events.off(render, 'afterRender', drawHeightGoals)
      Render.stop(render)
      Runner.stop(runner)
      Composite.clear(world, false)
      Engine.clear(engine)
      render.canvas.remove()
      render.textures = {}

      if (levelTimerRef.current) {
        clearInterval(levelTimerRef.current)
        levelTimerRef.current = null
      }
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current)
        sessionTimerRef.current = null
      }
    }
  }, [activeMode, gameConfig, currentView])

  // Start session timer when game view loads
  useEffect(() => {
    if (currentView !== 'game' || !activeMode) return

    const sessionDuration = activeMode.rules?.session_duration
    if (!sessionDuration) return

    // Initialize session time
    setSessionTime(sessionDuration)

    // Start countdown
    sessionTimerRef.current = setInterval(() => {
      setSessionTime(prev => {
        if (prev <= 1) {
          clearInterval(sessionTimerRef.current)
          sessionTimerRef.current = null
          // Disable mouse constraint when time is up
          if (mouseConstraintRef.current && engineRef.current) {
            Matter.Composite.remove(engineRef.current.world, mouseConstraintRef.current)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current)
        sessionTimerRef.current = null
      }
    }
  }, [currentView, activeMode])

  // Calculate the tower height (distance from ground to highest block)
  const calculateTowerHeight = useCallback(() => {
    if (!engineRef.current || !sceneRef.current) return 0
    const world = engineRef.current.world
    const bodies = Composite.allBodies(world)
    const container = sceneRef.current
    const height = container.clientHeight || 600
    const groundH = Math.max(20, Math.round(height * 0.06))
    const groundY = height - groundH  // TOP of ground, where blocks rest
    
    // Find the highest point (lowest Y value) among non-static bodies
    let highestY = groundY
    let highestBlock = null
    bodies.forEach(b => {
      if (!b.isStatic && b.syncId) {
        // Account for block size (bounds)
        const topY = b.bounds.min.y
        if (topY < highestY) {
          highestY = topY
          highestBlock = b
        }
      }
    })
    
    // Height is distance from ground to highest point
    const towerHeight = Math.max(0, groundY - highestY)
    console.log(`📏 Tower height calculation: containerHeight=${height}, groundY=${groundY}, highestY=${Math.round(highestY)}, towerHeight=${Math.round(towerHeight)}, highestBlock=${highestBlock?.syncId}`)
    return Math.round(towerHeight)
  }, [])

  // Count total blocks placed
  const countTotalBlocks = useCallback(() => {
    if (!engineRef.current) return 0
    const world = engineRef.current.world
    const bodies = Composite.allBodies(world)
    return bodies.filter(b => !b.isStatic).length
  }, [])

  // Check game result when session ends
  const checkGameResult = useCallback(() => {
    if (!activeMode) return null
    
    const towerHeight = calculateTowerHeight()
    const totalBlocks = countTotalBlocks()
    const winCondition = activeMode.rules?.win_condition || activeMode.win_condition
    
    const result = {
      towerHeight,
      totalBlocks,
      turnsPlayed: Math.floor(turnCount / 2) + 1,
      status: 'completed'
    }
    
    // Check specific win conditions
    if (winCondition?.type === 'max_height') {
      // For max_height, there's no specific target - just measure achievement
      result.status = towerHeight > 100 ? 'great' : towerHeight > 50 ? 'good' : 'completed'
    } else if (winCondition?.type === 'count_blocks') {
      const target = winCondition.count || 10
      result.targetBlocks = target
      result.status = totalBlocks >= target ? 'won' : 'failed'
    }
    
    return result
  }, [activeMode, calculateTowerHeight, countTotalBlocks, turnCount])

  // Check game result when session time reaches 0
  useEffect(() => {
    if (sessionTime === 0 && currentView === 'game' && !gameResult) {
      // Small delay to let physics settle
      const resultTimeout = setTimeout(() => {
        const result = checkGameResult()
        if (result) {
          setGameResult(result)
          
          // In multiplayer, send final score to server
          if (multiplayerGame) {
            matchmaking.endGame(result.towerHeight)
          }
        }
      }, 500)
      
      return () => clearTimeout(resultTimeout)
    }
  }, [sessionTime, currentView, gameResult, checkGameResult, multiplayerGame])

  // Helper to get all block states from the physics world
  const getBlockStates = useCallback(() => {
    if (!engineRef.current) return []
    const world = engineRef.current.world
    const bodies = Composite.allBodies(world)
    return bodies
      .filter(b => !b.isStatic && b.syncId) // Only sync blocks with syncId
      .map(b => ({
        syncId: b.syncId,
        label: b.label,
        x: b.position.x,
        y: b.position.y,
        angle: b.angle,
        velocityX: b.velocity.x,
        velocityY: b.velocity.y
      }))
  }, [])

  // Helper to apply block states from partner
  const applyBlockStates = useCallback((blockStates) => {
    if (!engineRef.current || !gameConfig) return
    const world = engineRef.current.world
    const bodies = Composite.allBodies(world)
    
    console.log(`📥 Applying ${blockStates.length} block states from partner`)
    
    blockStates.forEach(state => {
      // Find block by syncId instead of Matter.js id
      let body = bodies.find(b => b.syncId === state.syncId)
      
      // If block doesn't exist locally, create it
      if (!body && state.label && gameConfig.block_library) {
        const blockConfig = gameConfig.block_library[state.label]
        if (blockConfig) {
          body = createBlock(blockConfig, { x: state.x, y: state.y }, state.syncId)
          Composite.add(world, body)
          console.log(`🧱 Created missing block with syncId: ${state.syncId}`)
        }
      }
      
      if (body && !body.isStatic) {
        // Set position, angle, and velocity to match partner's state
        Matter.Body.setPosition(body, { x: state.x, y: state.y })
        Matter.Body.setAngle(body, state.angle)
        // Set velocity to 0 to stop movement
        Matter.Body.setVelocity(body, { x: 0, y: 0 })
        Matter.Body.setAngularVelocity(body, 0)
        // Put block to sleep to prevent physics from moving it
        Matter.Sleeping.set(body, true)
        console.log(`✅ Synced block ${state.syncId} to (${Math.round(state.x)}, ${Math.round(state.y)})`)
      } else if (!body) {
        console.log(`❌ Could not find or create block with syncId: ${state.syncId}`)
      }
    })
  }, [gameConfig])

  // Collaborative multiplayer event handlers
  useEffect(() => {
    if (currentView !== 'game' || !multiplayerGame) return

    // Handle turn changes from server
    const handleTurnChanged = (data) => {
      console.log(`🔄 Turn changed: isYourTurn=${data.isYourTurn}, turnCount=${data.turnCount}, blockStates=${data.blockStates?.length || 0}`)
      setIsMyTurn(data.isYourTurn)
      setTurnCount(data.turnCount)
      
      // Apply the block states from partner - this is the authoritative state
      if (data.blockStates && data.blockStates.length > 0) {
        console.log('📥 Received block states from partner:', data.blockStates)
        
        // First, synchronize all blocks from the received state
        if (engineRef.current && gameConfig) {
          const world = engineRef.current.world
          const bodies = Composite.allBodies(world)
          const receivedSyncIds = new Set(data.blockStates.map(s => s.syncId))
          
          // Remove any blocks that exist locally but not in the synced state
          // (except start blocks which should exist on both sides)
          bodies.forEach(b => {
            if (!b.isStatic && b.syncId && !receivedSyncIds.has(b.syncId)) {
              // Don't remove start blocks - they should be consistent
              if (!b.syncId.startsWith('start_block_') && !b.syncId.startsWith('level_start_')) {
                console.log(`🗑️ Removing orphan block: ${b.syncId}`)
                Composite.remove(world, b)
              }
            }
          })
        }
        
        applyBlockStates(data.blockStates)
      }
      
      // Enable/disable mouse constraint based on turn
      if (mouseConstraintRef.current && engineRef.current) {
        if (data.isYourTurn) {
          // Re-add mouse constraint if not present
          const world = engineRef.current.world
          const bodies = Composite.allBodies(world)
          if (!bodies.includes(mouseConstraintRef.current)) {
            Composite.add(world, mouseConstraintRef.current)
          }
        }
      }
    }

    // Handle block spawned by partner
    const handleBlockSpawned = (data) => {
      if (data.spawnedBy !== playerNumber && engineRef.current && gameConfig) {
        // Partner spawned a block, we need to add it locally with the same syncId
        const blockConfig = gameConfig.block_library[data.block.label]
        if (blockConfig) {
          const body = createBlock(blockConfig, { x: data.block.x, y: data.block.y }, data.block.syncId)
          Composite.add(engineRef.current.world, body)
          blockBodiesRef.current.set(data.block.syncId, body)
          console.log(`🧱 Partner spawned block with syncId: ${data.block.syncId}`)
        }
      }
      setSpawnedBlocks(data.totalBlocks)
    }

    // Handle real-time block position updates from partner
    const handleBlockPositionUpdate = (data) => {
      if (!engineRef.current) return
      const world = engineRef.current.world
      const bodies = Composite.allBodies(world)
      // Find block by syncId instead of Matter.js id
      const body = bodies.find(b => b.syncId === data.syncId)
      if (body && !body.isStatic) {
        Matter.Body.setPosition(body, { x: data.x, y: data.y })
        if (data.angle !== undefined) {
          Matter.Body.setAngle(body, data.angle)
        }
      }
    }

    // Handle full game state sync from partner
    const handleGameStateSync = (data) => {
      if (data.blockStates) {
        applyBlockStates(data.blockStates)
      }
    }

    // Handle game result from server (multiplayer game end)
    const handleGameResult = (data) => {
      console.log('🏆 Handling game result:', data)
      
      // Use the same calculation as calculateTowerHeight for consistency
      const towerHeight = calculateTowerHeight()
      const totalBlocks = countTotalBlocks()

      // Determine result status based on tower height
      let status = 'completed'
      if (towerHeight >= 300) status = 'won'
      else if (towerHeight >= 200) status = 'great'
      else if (towerHeight >= 100) status = 'good'
      else status = 'completed'

      // Set game result to show the result overlay
      setGameResult({
        status,
        towerHeight: Math.round(towerHeight),
        totalBlocks,
        turnsPlayed: turnCount,
        multiplayerResult: data, // Store the full multiplayer result
      })

      // Force session time to 0 to show result
      setSessionTime(0)
    }

    matchmaking.on('turn_changed', handleTurnChanged)
    matchmaking.on('block_spawned', handleBlockSpawned)
    matchmaking.on('block_position_update', handleBlockPositionUpdate)
    matchmaking.on('game_state_sync', handleGameStateSync)
    matchmaking.on('game_result', handleGameResult)

    return () => {
      matchmaking.off('turn_changed', handleTurnChanged)
      matchmaking.off('block_spawned', handleBlockSpawned)
      matchmaking.off('block_position_update', handleBlockPositionUpdate)
      matchmaking.off('game_state_sync', handleGameStateSync)
      matchmaking.off('game_result', handleGameResult)
    }
  }, [currentView, multiplayerGame, playerNumber, gameConfig, applyBlockStates, turnCount])

  // Sync block positions while dragging in multiplayer
  useEffect(() => {
    if (!multiplayerGame || !draggedBody || !isMyTurn) return

    const syncInterval = setInterval(() => {
      if (draggedBody && draggedBody.syncId) {
        matchmaking.syncBlockPosition(
          draggedBody.syncId,
          draggedBody.position.x,
          draggedBody.position.y,
          draggedBody.angle
        )
      }
    }, 50) // Sync every 50ms while dragging

    return () => clearInterval(syncInterval)
  }, [multiplayerGame, draggedBody, isMyTurn])

  // Enable/disable mouse controls based on turn (works for both modes)
  useEffect(() => {
    if (!engineRef.current || !mouseConstraintRef.current) return

    const world = engineRef.current.world
    const mouseConstraint = mouseConstraintRef.current
    const bodies = Composite.allBodies(world)

    if (isMyTurn) {
      // Enable dragging - add mouse constraint if not present
      if (!bodies.includes(mouseConstraint)) {
        Composite.add(world, mouseConstraint)
      }
      
      // Unfreeze all blocks when it's your turn (in multiplayer)
      if (multiplayerGame) {
        bodies.forEach(b => {
          if (!b.isStatic && b.syncId) {
            Matter.Sleeping.set(b, false)
          }
        })
      }
    } else {
      // Disable dragging - remove mouse constraint
      Composite.remove(world, mouseConstraint)
      
      // Freeze all blocks when it's partner's turn (in multiplayer)
      // This prevents physics divergence between clients
      if (multiplayerGame) {
        bodies.forEach(b => {
          if (!b.isStatic && b.syncId) {
            // Set blocks to sleep so physics doesn't move them
            Matter.Sleeping.set(b, true)
          }
        })
      }
    }
  }, [isMyTurn, multiplayerGame])

  // 4. Update spawner logic
  const spawnBlock = () => {
    if (engineRef.current && activeMode && sceneRef.current) {
      // Only spawn if it's your turn (applies to both modes)
      if (!isMyTurn) {
        return
      }

      // Check if max blocks limit reached
      const maxBlocks = activeMode.spawner?.max_blocks
      if (maxBlocks && spawnedBlocks >= maxBlocks) {
        return // Don't spawn if limit reached
      }

      // Pick allowed blocks from the active level when running, otherwise fall back to mode spawner
      const allowed = (activeLevel && levelState.started && activeLevel.allowed_blocks && activeLevel.allowed_blocks.length)
        ? activeLevel.allowed_blocks
        : activeMode.spawner.allowed_blocks

      const blockId = allowed[Math.floor(Math.random() * allowed.length)]
      const blockConfig = gameConfig.block_library[blockId];

      if (blockConfig) {
        // compute spawn position based on scene size so blocks always spawn inside the visible canvas
        const container = sceneRef.current
        const rect = container.getBoundingClientRect()
        const width = rect.width || container.clientWidth || 800
        const height = rect.height || container.clientHeight || 600
        const groundH = Math.max(20, Math.round(height * 0.06))
        const padding = 40 // keep some spacing from edges
        const x = Math.random() * Math.max(0, width - padding * 2) + padding
        const yTop = Math.max(30, Math.round(height * 0.08))
        const y = Math.min(yTop, height - groundH - padding)

        const position = { x, y }
        const block = createBlock(blockConfig, position)
        Composite.add(engineRef.current.world, block)
        
        // Track the block for syncing using syncId
        blockBodiesRef.current.set(block.syncId, block)
        
        // In collaborative mode, notify partner and update count via server
        if (multiplayerGame) {
          matchmaking.spawnBlock({
            syncId: block.syncId,
            label: blockConfig.label,
            x: position.x,
            y: position.y
          })
          console.log(`🧱 Spawned block with syncId: ${block.syncId}`)
        } else {
          setSpawnedBlocks(prev => prev + 1)
        }
      }
    }
  }

  // End turn - works for both collaborative and training mode
  const endTurn = () => {
    console.log('🔄 endTurn called', { isMyTurn, multiplayerGame, gameId: matchmaking.currentGameId })
    if (!isMyTurn) {
      console.log('❌ Not my turn, returning')
      return
    }
    
    if (multiplayerGame) {
      // Collaborative mode: send to server and wait for partner
      const blockStates = getBlockStates()
      console.log('📤 Sending end_turn to server', { blockStates, gameId: matchmaking.currentGameId })
      matchmaking.endTurn(blockStates)
      setIsMyTurn(false)
    } else {
      // Training mode: simulate turn switch (brief pause then back to player)
      setIsMyTurn(false)
      setTurnCount(prev => prev + 1)
      
      // Simulate "partner's turn" with a brief delay
      setTimeout(() => {
        setTurnCount(prev => prev + 1)
        setIsMyTurn(true)
      }, 1000) // 1 second pause to simulate partner
    }
  }

  // Helpers for level management
  const clearNonStaticBodies = () => {
    if (!engineRef.current) return
    const world = engineRef.current.world
    const bodies = Composite.allBodies(world)
    bodies.forEach(b => {
      if (!b.isStatic) {
        Composite.remove(world, b)
      }
    })
  }

  const addStartBlocksForLevel = (level) => {
    if (!engineRef.current || !level) return
    const world = engineRef.current.world

    // Support both `start_blocks` and `start_condition` (ref into gameConfig.start_conditions)
    let blocks = null
    if (level.start_blocks && Array.isArray(level.start_blocks)) {
      blocks = level.start_blocks
      if (level.start_condition) console.warn('Both `start_blocks` and `start_condition` present on level; using `start_blocks`.')
    } else if (level.start_condition && gameConfig && gameConfig.start_conditions && gameConfig.start_conditions[level.start_condition]) {
      blocks = gameConfig.start_conditions[level.start_condition]
      console.warn('`start_condition` on level is deprecated; prefer `start_blocks`. Using referenced start condition from strategy.yaml.')
    }

    if (!blocks) return

    blocks.forEach((sb, index) => {
      const blockConfig = gameConfig.block_library[sb.block_id]
      if (blockConfig) {
        // resolve percentage positions same as other code
        const container = sceneRef.current
        const { width, height } = container ? { width: container.clientWidth, height: container.clientHeight } : { width: 320, height: 640 }
        const resolve = (v, axisSize) => {
          if (typeof v === 'string' && v.trim().endsWith('%')) {
            const pct = parseFloat(v) / 100
            return Math.round(pct * axisSize)
          }
          return Number(v)
        }
        const pos = { x: resolve(sb.position.x, width), y: resolve(sb.position.y, height) }
        // Use deterministic syncId for level start blocks
        const levelSyncId = `level_start_${index}_${sb.block_id}`
        const body = createBlock(blockConfig, pos, levelSyncId)
        Composite.add(world, body)
      }
    })
  }

  const countBlocksOfType = (blockId) => {
    if (!engineRef.current) return 0
    const world = engineRef.current.world
    const bodies = Composite.allBodies(world)
    return bodies.reduce((acc, b) => acc + (b.label === blockId ? 1 : 0), 0)
  }

  const checkLevelWin = () => {
    if (!activeLevel || !engineRef.current || !activeLevel.target) return
    const t = activeLevel.target
    if (t.type === 'count_blocks') {
      const count = t.block_id ? countBlocksOfType(t.block_id) : countTotalBlocks()
      if (count >= t.count) {
        // win
        setLevelState(prev => ({ ...prev, status: 'completed', started: false }))
        if (levelTimerRef.current) {
          clearInterval(levelTimerRef.current)
          levelTimerRef.current = null
        }
      }
    }
    // TODO: more target types (height, etc.)
  }

  const startLevel = (levelId) => {
    const lvl = levels.find(l => l.id === levelId)
    if (!lvl) return
    setActiveLevel(lvl)
    // Clear world and add start blocks
    clearNonStaticBodies()
    addStartBlocksForLevel(lvl)

    setLevelState({ started: true, remainingTime: lvl.time_limit || null, status: 'running' })

    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current)
      levelTimerRef.current = null
    }

    levelTimerRef.current = setInterval(() => {
      setLevelState(prev => {
        const rem = (prev.remainingTime || 0) - 1
        if (rem <= 0) {
          // fail
          clearInterval(levelTimerRef.current)
          levelTimerRef.current = null
          return { ...prev, remainingTime: 0, status: 'failed', started: false }
        }
        return { ...prev, remainingTime: rem }
      })
      // check win after each tick
      checkLevelWin()
    }, 1000)
  }

  const resetLevel = () => {
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current)
      levelTimerRef.current = null
    }
    setLevelState({ started: false, remainingTime: null, status: 'idle' })
    clearNonStaticBodies()
    // re-add start blocks for the selected level (if any)
    if (activeLevel) addStartBlocksForLevel(activeLevel)
  }

  // Show homepage if not in game
  if (currentView === 'homepage') {
    return (
      <Homepage 
        gameModes={gameConfig?.game_modes || []} 
        onStartGame={handleStartGame}
        onStartMultiplayer={handleStartMultiplayer}
      />
    )
  }

  // Show lobby for multiplayer matchmaking
  if (currentView === 'lobby' && lobbyData) {
    return (
      <GameLobby
        modeId={lobbyData.modeId}
        modeName={lobbyData.modeName}
        onGameStart={handleMultiplayerGameStart}
        onCancel={handleCancelLobby}
      />
    )
  }

  return (
    <div className='flex flex-col items-center bg-transparent py-12'>
      <header className='relative text-center mb-4'>
        {activeMode ? (
          <>
            <button 
              className='px-4 py-2 mb-8 text-sm text-[#9fb0cc] bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all duration-150 hover:bg-white/10 hover:text-[#e6eef8]' 
              onClick={handleBackToHome}
            >
              ← Back to Menu
            </button>
            <h1 className='text-2xl font-bold text-[#e6eef8] mb-2'>{activeMode.name}</h1>
            <p className='text-sm text-[#9fb0cc] mb-4'>{activeMode.description}</p>

            {/* Collaborative Mode Partner Info */}
            {multiplayerGame && (
              <div className='mb-4 p-3 bg-white/5 border border-white/10 rounded-lg'>
                <div className='flex items-center justify-center gap-4 text-sm'>
                  <span className='text-[#9fb0cc]'>
                    👥 Playing with: <span className='text-[#6ea0d6] font-mono'>
                      {partnerAddress ? `${partnerAddress.slice(0, 6)}...${partnerAddress.slice(-4)}` : 'Partner'}
                    </span>
                  </span>
                  <span className='text-[#9fb0cc]'>
                    You are Player {playerNumber}
                  </span>
                </div>
                <div className={`mt-2 text-lg font-bold ${isMyTurn ? 'text-green-400' : 'text-yellow-400'}`}>
                  {isMyTurn ? '🎯 Your Turn!' : '⏳ Partner\'s Turn...'}
                </div>
                {turnCount > 0 && (
                  <div className='text-xs text-[#9fb0cc] mt-1'>Turn #{turnCount + 1}</div>
                )}
              </div>
            )}

            {/* Training Mode Turn Info */}
            {!multiplayerGame && (
              <div className='mb-4 p-3 bg-white/5 border border-white/10 rounded-lg'>
                <div className='text-sm text-[#9fb0cc] mb-1'>
                  🎓 Training Mode — Practice like it's the real thing!
                </div>
                <div className={`text-lg font-bold ${isMyTurn ? 'text-green-400' : 'text-yellow-400'}`}>
                  {isMyTurn ? '🎯 Your Turn!' : '⏳ Simulating partner...'}
                </div>
                <div className='text-xs text-[#9fb0cc] mt-1'>Turn #{Math.floor(turnCount / 2) + 1}</div>
              </div>
            )}

            {/* Session Timer */}
            {sessionTime !== null && sessionTime > 0 && (
              <div className={`text-4xl font-bold mb-4 ${sessionTime <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
                ⏱️ {sessionTime}s
              </div>
            )}
            
            {/* Game Result Display */}
            {sessionTime === 0 && gameResult && (
              <div className='mb-6 p-6 bg-gradient-to-b from-white/10 to-white/5 border border-white/20 rounded-xl'>
                <div className='text-2xl font-bold text-white mb-4'>
                  {gameResult.status === 'won' ? '🎉 Congratulations!' : 
                   gameResult.status === 'great' ? '🌟 Amazing Tower!' :
                   gameResult.status === 'good' ? '👍 Good Job!' :
                   gameResult.status === 'failed' ? '😅 Nice Try!' :
                   '⏰ Time\'s Up!'}
                </div>
                
                <div className='grid grid-cols-2 gap-4 mb-4'>
                  <div className='bg-white/5 rounded-lg p-3'>
                    <div className='text-xs text-[#9fb0cc] uppercase'>Tower Height</div>
                    <div className='text-3xl font-bold text-[#6ea0d6]'>{gameResult.towerHeight}px</div>
                  </div>
                  <div className='bg-white/5 rounded-lg p-3'>
                    <div className='text-xs text-[#9fb0cc] uppercase'>Blocks Placed</div>
                    <div className='text-3xl font-bold text-[#6ea0d6]'>{gameResult.totalBlocks}</div>
                  </div>
                </div>
                
                <div className='text-sm text-[#9fb0cc] mb-4'>
                  Completed in {gameResult.turnsPlayed} turn{gameResult.turnsPlayed !== 1 ? 's' : ''}
                </div>
                
                {gameResult.targetBlocks && (
                  <div className={`text-sm ${gameResult.status === 'won' ? 'text-green-400' : 'text-yellow-400'}`}>
                    Target: {gameResult.totalBlocks}/{gameResult.targetBlocks} blocks
                  </div>
                )}
                
                <button 
                  className='mt-4 px-6 py-3 text-base font-bold text-white rounded-lg cursor-pointer transition-all duration-150 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500'
                  onClick={handleBackToHome}
                >
                  🏠 Back to Menu
                </button>
              </div>
            )}
            
            {sessionTime === 0 && !gameResult && (
              <div className='text-xl font-bold text-yellow-400 mb-4 animate-pulse'>
                Calculating results...
              </div>
            )}

            {/* Game Controls - hidden when game is over */}
            {sessionTime !== 0 && (
              <div className='flex gap-2 items-center justify-center flex-wrap'>
                {(() => {
                  const maxBlocks = activeMode.spawner?.max_blocks
                  const remaining = maxBlocks ? maxBlocks - spawnedBlocks : null
                  const isTimeUp = sessionTime === 0
                  const isNotMyTurn = !isMyTurn
                  const isDisabled = isTimeUp || isNotMyTurn || (maxBlocks && spawnedBlocks >= maxBlocks)
                  
                  return (
                    <>
                      <button 
                        className={`px-4 py-2 text-sm font-medium text-[#e6eef8] rounded-md cursor-pointer transition-all duration-150 ${
                          isDisabled 
                            ? 'bg-gray-500/50 cursor-not-allowed' 
                            : 'bg-[#6D28D9]/80 hover:bg-[#6D28D9]'
                        }`}
                        onClick={spawnBlock}
                        disabled={isDisabled}
                      >
                        {isTimeUp ? 'Game Over' : isNotMyTurn ? (multiplayerGame ? 'Wait for Partner' : 'Wait...') : `Spawn Block${remaining !== null ? ` (${remaining})` : ''}`}
                      </button>
                    
                    {/* End Turn button - works for both collaborative and training mode */}
                    {isMyTurn && !isTimeUp && (
                      <button 
                        className='px-6 py-3 text-base font-bold text-white rounded-lg cursor-pointer transition-all duration-150 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-lg hover:shadow-green-500/25 hover:-translate-y-0.5'
                        onClick={endTurn}
                      >
                        ✅ END TURN
                      </button>
                    )}
                  </>
                )
              })()}
              </div>
            )}

            <div className='mt-2 text-xs text-[#9fb0cc]'>
              {activeLevel && <span>Level: {activeLevel.name} — {activeLevel.description} </span>}
              {levelState.status === 'running' && <span> • Time left: {levelState.remainingTime}s</span>}
              {levelState.status === 'completed' && <span className='text-green-400'> • Completed ✅</span>}
              {levelState.status === 'failed' && <span className='text-red-400'> • Failed ⛔</span>}
            </div>
          </>
        ) : (
          <h1 className='text-2xl font-bold text-[#e6eef8]'>Loading Game...</h1>
        )}
      </header>
      <main className='w-full flex justify-center'>
        <article ref={sceneRef} className='scene'></article>
      </main>
      <footer className='mt-4'>
        <a 
          href="https://github.com/MatthieuScarset/flash-point"
          className='text-[#6ea0d6] text-sm no-underline hover:underline'
        >
          🙈 Github
        </a>
      </footer>
    </div>
  )
}

export default App
