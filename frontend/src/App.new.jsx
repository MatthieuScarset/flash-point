import React, { useEffect, useState, useCallback, useRef } from 'react'
import Matter from 'matter-js'
import yaml from 'js-yaml'
import Homepage from './components/Homepage'
import GameLobby from './components/GameLobby'
import { matchmaking } from './services/matchmaking'
import { createBlock } from './utils/blockUtils'
import './style.css'

const Bodies = Matter.Bodies
const Composite = Matter.Composite

/**
 * Main Application Component
 * Handles view routing and game state management
 */
function App() {
  // Core state
  const sceneRef = useRef(null)
  const engineRef = useRef(null)
  const renderRef = useRef(null)
  const groundRef = useRef(null)
  const levelTimerRef = useRef(null)
  const sessionTimerRef = useRef(null)
  const mouseConstraintRef = useRef(null)
  const blockBodiesRef = useRef(new Map())
  
  // Configuration state
  const [gameConfig, setGameConfig] = useState(null)
  const [activeMode, setActiveMode] = useState(null)
  const [levels, setLevels] = useState([])
  const [activeLevelId, setActiveLevelId] = useState(null)
  const [activeLevel, setActiveLevel] = useState(null)
  
  // Game state
  const [levelState, setLevelState] = useState({ started: false, remainingTime: null, status: 'idle' })
  const [sessionTime, setSessionTime] = useState(null)
  const [currentView, setCurrentView] = useState('homepage')
  const [lobbyData, setLobbyData] = useState(null)
  const [multiplayerGame, setMultiplayerGame] = useState(null)
  const [spawnedBlocks, setSpawnedBlocks] = useState(0)
  const [draggedBody, setDraggedBody] = useState(null)
  const [gameResult, setGameResult] = useState(null)
  
  // Multiplayer state
  const [isMyTurn, setIsMyTurn] = useState(true)
  const [playerNumber, setPlayerNumber] = useState(null)
  const [partnerAddress, setPartnerAddress] = useState(null)
  const [turnCount, setTurnCount] = useState(0)

  // Load strategy config
  useEffect(() => {
    fetch('/configs/strategy.yaml')
      .then((response) => response.text())
      .then((text) => {
        const fullConfig = yaml.load(text)
        setGameConfig(fullConfig)
        const mode = fullConfig.game_modes.find(m => m.id === fullConfig.active_game_mode)
        setActiveMode(mode)
      })
  }, [])

  // Load levels config
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
      }).catch(() => {})
  }, [])

  // Handle starting a solo game
  const handleStartGame = useCallback((modeId) => {
    const mode = gameConfig.game_modes.find(m => m.id === modeId)
    if (mode) {
      setActiveMode(mode)
      setMultiplayerGame(null)
      setIsMyTurn(true)
      setPlayerNumber(1)
      setTurnCount(0)
      setCurrentView('game')
    }
  }, [gameConfig])

  // Handle starting multiplayer
  const handleStartMultiplayer = useCallback((modeId, modeName) => {
    setLobbyData({ modeId, modeName })
    setCurrentView('lobby')
  }, [])

  // Handle multiplayer match found
  const handleMultiplayerGameStart = useCallback((gameData) => {
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
  }, [gameConfig])

  // Handle cancel lobby
  const handleCancelLobby = useCallback(() => {
    setLobbyData(null)
    setCurrentView('homepage')
  }, [])

  // Go back to homepage
  const handleBackToHome = useCallback(() => {
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
    if (multiplayerGame) {
      matchmaking.disconnect()
    }
  }, [multiplayerGame])

  // Calculate tower height
  const calculateTowerHeight = useCallback(() => {
    if (!engineRef.current || !groundRef.current) return 0
    
    const world = engineRef.current.world
    const bodies = Matter.Composite.allBodies(world)
    const groundTop = groundRef.current.position.y - 10
    
    let highestPoint = groundTop
    
    bodies.forEach(body => {
      if (body.isStatic || body === groundRef.current) return
      const bodyTop = body.position.y - (body.bounds.max.y - body.bounds.min.y) / 2
      if (bodyTop < highestPoint) {
        highestPoint = bodyTop
      }
    })
    
    return Math.max(0, Math.round(groundTop - highestPoint))
  }, [])

  // Check game result
  const checkGameResult = useCallback(() => {
    const towerHeight = calculateTowerHeight()
    const totalBlocks = spawnedBlocks
    const turnsPlayed = turnCount
    
    let status = 'completed'
    let targetBlocks = null
    
    if (activeLevel?.blocks_to_place) {
      targetBlocks = activeLevel.blocks_to_place
      if (totalBlocks >= targetBlocks) {
        status = 'won'
      }
    }
    
    if (activeLevel?.target_height_px) {
      if (towerHeight >= activeLevel.target_height_px) {
        status = 'won'
      }
    }
    
    setGameResult({
      towerHeight,
      totalBlocks,
      turnsPlayed,
      status,
      targetBlocks
    })
  }, [calculateTowerHeight, spawnedBlocks, turnCount, activeLevel])

  // Setup Matter.js world
  useEffect(() => {
    if (!activeMode || !gameConfig || currentView !== 'game') return

    const Engine = Matter.Engine
    const Render = Matter.Render
    const Runner = Matter.Runner

    const engine = Engine.create()
    engineRef.current = engine
    const world = engine.world

    const container = sceneRef.current
    const ASPECT = 9 / 16

    const getSize = () => {
      const maxWidth = Math.min(360, Math.round(window.innerWidth * 0.6))
      const width = container.clientWidth || maxWidth || 320
      let height = container.clientHeight || 0

      if (!height || height === 0) {
        height = Math.round(width / ASPECT)
        const maxH = Math.round(window.innerHeight * 0.9)
        height = Math.min(height, maxH)
      }

      return { width, height }
    }

    let { width, height } = getSize()

    const render = Render.create({
      element: container,
      engine: engine,
      options: {
        width,
        height,
        wireframes: false,
        background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)'
      }
    })
    renderRef.current = render

    // Ground
    const ground = Bodies.rectangle(width / 2, height - 20, width, 40, {
      isStatic: true,
      render: { fillStyle: '#4a5568' }
    })
    groundRef.current = ground
    
    // Walls
    const wallLeft = Bodies.rectangle(-20, height / 2, 40, height, {
      isStatic: true,
      render: { fillStyle: '#2d3748' }
    })
    const wallRight = Bodies.rectangle(width + 20, height / 2, 40, height, {
      isStatic: true,
      render: { fillStyle: '#2d3748' }
    })

    Composite.add(world, [ground, wallLeft, wallRight])

    // Mouse control
    const mouse = Matter.Mouse.create(render.canvas)
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.2,
        render: { visible: false }
      }
    })
    mouseConstraintRef.current = mouseConstraint

    Matter.Events.on(mouseConstraint, 'startdrag', (event) => {
      if (event.body && !event.body.isStatic) {
        setDraggedBody(event.body)
      }
    })

    Matter.Events.on(mouseConstraint, 'enddrag', (event) => {
      setDraggedBody(null)
    })

    Composite.add(world, mouseConstraint)
    render.mouse = mouse

    Render.run(render)
    const runner = Runner.create()
    Runner.run(runner, engine)

    // Start session timer if mode has session_duration
    if (activeMode.session_duration) {
      setSessionTime(activeMode.session_duration)
      sessionTimerRef.current = setInterval(() => {
        setSessionTime((prev) => {
          if (prev === null) return null
          if (prev <= 1) {
            clearInterval(sessionTimerRef.current)
            sessionTimerRef.current = null
            setTimeout(() => checkGameResult(), 100)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    // Handle resize
    const handleResize = () => {
      const { width: newWidth, height: newHeight } = getSize()
      render.canvas.width = newWidth
      render.canvas.height = newHeight
      render.options.width = newWidth
      render.options.height = newHeight
      render.bounds.max.x = newWidth
      render.bounds.max.y = newHeight
      
      if (groundRef.current) {
        Matter.Body.setPosition(groundRef.current, { x: newWidth / 2, y: newHeight - 20 })
      }
    }

    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      Render.stop(render)
      Runner.stop(runner)
      Engine.clear(engine)
      render.canvas.remove()
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current)
        sessionTimerRef.current = null
      }
      blockBodiesRef.current.clear()
    }
  }, [activeMode, gameConfig, currentView, checkGameResult])

  // Listen for multiplayer events
  useEffect(() => {
    if (!multiplayerGame) return

    const handleTurnChanged = (data) => {
      setIsMyTurn(data.isYourTurn)
      setTurnCount(data.turnCount)
    }

    const handleBlockSpawned = (data) => {
      if (data.playerId !== matchmaking.socket?.id && engineRef.current && gameConfig?.blocks) {
        const blockConfig = gameConfig.blocks.find(b => b.type === data.blockType)
        if (blockConfig) {
          const newBody = createBlock(blockConfig, { x: data.position.x, y: data.position.y })
          Matter.Composite.add(engineRef.current.world, newBody)
          blockBodiesRef.current.set(data.blockId, newBody)
          setSpawnedBlocks(prev => prev + 1)
        }
      }
    }

    const handleBlockSync = (data) => {
      if (data.playerId !== matchmaking.socket?.id) {
        const body = blockBodiesRef.current.get(data.blockId)
        if (body) {
          Matter.Body.setPosition(body, data.position)
          Matter.Body.setAngle(body, data.angle)
        }
      }
    }

    matchmaking.onTurnChanged(handleTurnChanged)
    matchmaking.onBlockSpawned(handleBlockSpawned)
    matchmaking.onBlockSync(handleBlockSync)

    return () => {
      matchmaking.offTurnChanged(handleTurnChanged)
      matchmaking.offBlockSpawned(handleBlockSpawned)
      matchmaking.offBlockSync(handleBlockSync)
    }
  }, [multiplayerGame, gameConfig])

  // Spawn block function
  const spawnBlock = useCallback(() => {
    if (!isMyTurn) return
    if (!engineRef.current || !gameConfig?.blocks) return
    
    const maxBlocks = activeLevel?.blocks_to_place
    if (maxBlocks && spawnedBlocks >= maxBlocks) return

    const blockTypes = gameConfig.blocks
    const randomBlock = blockTypes[Math.floor(Math.random() * blockTypes.length)]
    const renderRef_current = renderRef.current
    
    const x = renderRef_current ? renderRef_current.options.width / 2 : 150
    const y = 50
    const position = { x, y }

    const newBody = createBlock(randomBlock, position)
    Matter.Composite.add(engineRef.current.world, newBody)
    
    const blockId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    blockBodiesRef.current.set(blockId, newBody)
    
    setSpawnedBlocks(prev => prev + 1)

    // Sync with partner in multiplayer
    if (multiplayerGame) {
      matchmaking.spawnBlock({
        blockId,
        blockType: randomBlock.type,
        position
      })
    }

    return { blockId, body: newBody }
  }, [isMyTurn, gameConfig, activeLevel, spawnedBlocks, multiplayerGame])

  // End turn function
  const endTurn = useCallback(() => {
    if (!isMyTurn) return

    if (multiplayerGame) {
      // Sync all block positions before ending turn
      blockBodiesRef.current.forEach((body, blockId) => {
        matchmaking.syncBlockPosition({
          blockId,
          position: { x: body.position.x, y: body.position.y },
          angle: body.angle
        })
      })
      matchmaking.endTurn()
    } else {
      // Training mode: simulate partner turn
      setIsMyTurn(false)
      setTurnCount(prev => prev + 1)
      
      setTimeout(() => {
        setIsMyTurn(true)
        setTurnCount(prev => prev + 1)
      }, 1500)
    }
  }, [isMyTurn, multiplayerGame])

  // Clear blocks
  const clearBlocks = useCallback(() => {
    if (!engineRef.current) return
    
    const world = engineRef.current.world
    const bodies = Matter.Composite.allBodies(world)
    
    bodies.forEach(body => {
      if (!body.isStatic) {
        Matter.Composite.remove(world, body)
      }
    })
    
    blockBodiesRef.current.clear()
    setSpawnedBlocks(0)
  }, [])

  // Get result message
  const getResultMessage = (status) => {
    if (status === 'won') return '🎉 Victory! You reached the goal!'
    return '⏱️ Time\'s Up! Great effort!'
  }

  // Loading state
  if (!gameConfig) {
    return (
      <section className='w-full min-h-screen flex justify-center items-center flex-col text-center p-8 bg-[#0a1020]'>
        <div className='text-[#9fb0cc]'>Loading game configuration...</div>
      </section>
    )
  }

  // Homepage view
  if (currentView === 'homepage') {
    return (
      <Homepage 
        gameModes={gameConfig.game_modes}
        onStartGame={handleStartGame}
        onStartMultiplayer={handleStartMultiplayer}
      />
    )
  }

  // Lobby view
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

  // Game view
  const isMultiplayer = activeMode?.key === 'collaborative_stacking'
  const isTimeUp = sessionTime !== null && sessionTime <= 0
  const maxBlocks = activeLevel?.blocks_to_place

  return (
    <section className='w-full min-h-screen flex justify-center items-center flex-col text-center p-8 bg-[#0a1020]'>
      <button 
        className='px-4 py-2 mb-8 text-sm text-[#9fb0cc] bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all duration-150 hover:bg-white/10 hover:text-[#e6eef8]' 
        onClick={() => {
          clearBlocks()
          handleBackToHome()
        }}
      >
        ← Back to Menu
      </button>
      
      <h1 className='text-2xl font-bold text-[#e6eef8] mb-2'>{activeMode?.name}</h1>
      <p className='text-sm text-[#9fb0cc] mb-4'>{activeMode?.description}</p>

      {/* Session Timer */}
      {sessionTime !== null && sessionTime > 0 && (
        <div className={`text-4xl font-bold mb-4 ${sessionTime <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
          ⏱️ {sessionTime}s
        </div>
      )}

      {/* Game Result */}
      {gameResult ? (
        <div className='mb-6 p-6 bg-gradient-to-b from-white/10 to-white/5 border border-white/20 rounded-xl'>
          <div className='text-2xl font-bold text-white mb-4'>
            {getResultMessage(gameResult.status)}
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
            onClick={() => {
              clearBlocks()
              handleBackToHome()
            }}
          >
            🏠 Back to Menu
          </button>
        </div>
      ) : (
        <>
          {/* Turn Indicator */}
          {isMultiplayer ? (
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
          ) : (
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

          {/* Game Controls */}
          {!isTimeUp && (
            <div className='flex gap-2 items-center justify-center flex-wrap'>
              <button 
                className={`px-4 py-2 text-sm font-medium text-[#e6eef8] rounded-md cursor-pointer transition-all duration-150 ${
                  !isMyTurn || (maxBlocks && spawnedBlocks >= maxBlocks)
                    ? 'bg-gray-500/50 cursor-not-allowed' 
                    : 'bg-[#6D28D9]/80 hover:bg-[#6D28D9]'
                }`}
                onClick={spawnBlock}
                disabled={!isMyTurn || (maxBlocks && spawnedBlocks >= maxBlocks)}
              >
                {!isMyTurn 
                  ? (isMultiplayer ? 'Wait for Partner' : 'Wait...') 
                  : `Spawn Block${maxBlocks ? ` (${maxBlocks - spawnedBlocks})` : ''}`}
              </button>
              
              {isMyTurn && (
                <button 
                  className='px-6 py-3 text-base font-bold text-white rounded-lg cursor-pointer transition-all duration-150 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-lg hover:shadow-green-500/25 hover:-translate-y-0.5'
                  onClick={endTurn}
                >
                  ✅ END TURN
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Game Canvas */}
      <main className='w-full flex justify-center'>
        <article ref={sceneRef} className='scene'></article>
      </main>
    </section>
  )
}

export default App
