import React, { useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import yaml from 'js-yaml'
import Homepage from './components/Homepage'
import GameLobby from './components/GameLobby'
import './style.css'

const Bodies = Matter.Bodies
const Composite = Matter.Composite

const BLOCK_DEFAULT_RADIUS = 18
const BLOCK_DEFAULT_WIDTH = 32
const BLOCK_DEFAULT_HEIGHT = 32

const createBlock = (blockConfig, position) => {
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
  return body
}


function App() {
  const sceneRef = useRef(null)
  const engineRef = useRef(null)
  const levelTimerRef = useRef(null)
  const [gameConfig, setGameConfig] = useState(null)
  const [activeMode, setActiveMode] = useState(null)
  const [levels, setLevels] = useState([])
  const [activeLevelId, setActiveLevelId] = useState(null)
  const [activeLevel, setActiveLevel] = useState(null)
  const [levelState, setLevelState] = useState({ started: false, remainingTime: null, status: 'idle' })
  const [draggedBody, setDraggedBody] = useState(null)
  const [currentView, setCurrentView] = useState('homepage') // 'homepage', 'lobby', or 'game'
  const [lobbyData, setLobbyData] = useState(null) // { modeId, modeName }
  const [multiplayerGame, setMultiplayerGame] = useState(null) // game data from matchmaking

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
    setLevelState({ started: false, remainingTime: null, status: 'idle' })
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current)
      levelTimerRef.current = null
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

      startCondition.forEach(startBlock => {
        const blockConfig = gameConfig.block_library[startBlock.block_id];
        if (blockConfig && startBlock.position) {
          const position = resolvePosition(startBlock.position)
          const block = createBlock(blockConfig, position);
          Composite.add(world, block);
        }
      });
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      Matter.Events.off(mouseConstraint, 'startdrag', onStartDrag)
      Matter.Events.off(mouseConstraint, 'enddrag', onEndDrag)
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
    }
  }, [activeMode, gameConfig, currentView])

  // 4. Update spawner logic
  const spawnBlock = () => {
    if (engineRef.current && activeMode && sceneRef.current) {
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
      }
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

    blocks.forEach(sb => {
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
        const body = createBlock(blockConfig, pos)
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
      const count = countBlocksOfType(t.block_id)
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

            <div className='flex gap-2 items-center justify-center flex-wrap'>
              <button 
                className='px-4 py-2 text-sm font-medium text-[#e6eef8] bg-[#6D28D9]/80 rounded-md cursor-pointer transition-all duration-150 hover:bg-[#6D28D9]'
                onClick={spawnBlock}
              >
                Spawn Block
              </button>
            </div>

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
