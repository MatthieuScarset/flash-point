import React, { useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import yaml from 'js-yaml'
import './style.css'

const Bodies = Matter.Bodies
const Composite = Matter.Composite

// Helper function to create a block from the library
const createBlock = (blockConfig, position) => {
  const { shape, x, y } = position
  const commonProperties = {
    friction: blockConfig.friction,
    restitution: blockConfig.restitution,
    render: blockConfig.render
  }

  if (blockConfig.shape === 'rectangle') {
    return Bodies.rectangle(x, y, blockConfig.width, blockConfig.height, commonProperties)
  }
  
  // Default to polygon
  return Bodies.polygon(x, y, blockConfig.sides, blockConfig.radius, commonProperties)
}


function App() {
  const sceneRef = useRef(null)
  const engineRef = useRef(null)
  const [gameConfig, setGameConfig] = useState(null)
  const [activeMode, setActiveMode] = useState(null)
  const [draggedBody, setDraggedBody] = useState(null)

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

  // 2. Setup Matter.js world based on the active mode
  useEffect(() => {
    if (!activeMode || !gameConfig) return

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
    // pixel ratio between the internal canvas pixels and logical scene pixels
    const ratio = window.devicePixelRatio || 1
    mouse.pixelRatio = ratio
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: { stiffness: 0.2, render: { visible: false } }
    })
    Composite.add(world, mouseConstraint)

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

      // Update mouse to point to new canvas element and recompute pixel ratio
      const ratio = window.devicePixelRatio || 1
      mouse.element = render.canvas
      mouse.pixelRatio = ratio
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
    }
  }, [activeMode, gameConfig])

  // 4. Update spawner logic
  const spawnBlock = () => {
    if (engineRef.current && activeMode && sceneRef.current) {
      // Pick a random block from the allowed list
      const blockId = activeMode.spawner.allowed_blocks[Math.floor(Math.random() * activeMode.spawner.allowed_blocks.length)];
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

  return (
    <div className='app'>
      <header className='app-header'>
        {activeMode ? (
          <>
            <h1>{activeMode.name}</h1>
            <p>{activeMode.description}</p>
            <button onClick={spawnBlock}>Spawn Block</button>
          </>
        ) : (
          <h1>Loading Game...</h1>
        )}
      </header>
      <main className='app-content'>
        <article ref={sceneRef} className='scene'></article>
      </main>
      <footer className='app-footer'>
        <a href="https://github.com/MatthieuScarset/flash-point#">🙈 Github</a>
      </footer>
    </div>
  )
}

export default App
