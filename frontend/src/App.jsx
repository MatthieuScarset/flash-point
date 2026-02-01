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
    const ASPECT = 16 / 9
    const getSize = () => {
      const maxWidth = Math.min(1100, Math.round(window.innerWidth * 0.9))
      const width = container.clientWidth || maxWidth || 800
      let height = container.clientHeight || 0

      // If height isn't available (sometimes until CSS resolves), derive it from width and aspect
      if (!height || height === 0) {
        height = Math.round(width / ASPECT)
        const maxH = Math.round(window.innerHeight * 0.7)
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
        background: '#f0f0f0'
      }
    })

    // helper to set physical canvas size for high-DPI screens
    const setRenderSize = (width, height) => {
      const ratio = window.devicePixelRatio || 1
      render.options.width = width
      render.options.height = height
      render.bounds.max.x = width
      render.bounds.max.y = height
      render.canvas.width = Math.round(width * ratio)
      render.canvas.height = Math.round(height * ratio)
      render.canvas.style.width = `${width}px`
      render.canvas.style.height = `${height}px`
    }

    setRenderSize(size.width, size.height)

    Render.run(render)
    const runner = Runner.create()
    Runner.run(runner, engine)

    // Add ground and walls (kept as variables so we can rebuild on resize)
    let ground = Bodies.rectangle(size.width / 2, size.height + 30, size.width, 60, { isStatic: true })
    let topWall = Bodies.rectangle(size.width / 2, -10, size.width * 2, 20, { isStatic: true, render: { visible: false } })
    let leftWall = Bodies.rectangle(-10, size.height / 2, 20, size.height * 2, { isStatic: true, render: { visible: false } })
    let rightWall = Bodies.rectangle(size.width + 10, size.height / 2, 20, size.height * 2, { isStatic: true, render: { visible: false } })
    Composite.add(world, [ground, topWall, leftWall, rightWall])

    // Add mouse control (attach to the canvas and support devicePixelRatio)
    const mouse = Matter.Mouse.create(render.canvas)
    mouse.pixelRatio = window.devicePixelRatio || 1
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
      ground = Bodies.rectangle(width / 2, height + 30, width, 60, { isStatic: true })
      topWall = Bodies.rectangle(width / 2, -10, width * 2, 20, { isStatic: true, render: { visible: false } })
      leftWall = Bodies.rectangle(-10, height / 2, 20, height * 2, { isStatic: true, render: { visible: false } })
      rightWall = Bodies.rectangle(width + 10, height / 2, 20, height * 2, { isStatic: true, render: { visible: false } })
      Composite.add(world, [ground, topWall, leftWall, rightWall])

      // Update mouse to point to new canvas element
      mouse.element = render.canvas
      mouse.pixelRatio = window.devicePixelRatio || 1
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
        return { x: resolve(pos.x, width), y: resolve(pos.y, height) }
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
        const padding = 40 // keep some spacing from edges
        const x = Math.random() * Math.max(0, width - padding * 2) + padding
        const y = Math.max(30, Math.round(height * 0.08))

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
        I am a footer
      </footer>
    </div>
  )
}

export default App
