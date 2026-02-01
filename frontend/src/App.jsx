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

    const render = Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: 800,
        height: 600,
        wireframes: false,
        background: '#f0f0f0'
      }
    })

    Render.run(render)
    const runner = Runner.create()
    Runner.run(runner, engine)

    // Add ground and walls
    const ground = Bodies.rectangle(400, 600, 800, 60, { isStatic: true })
    const leftWall = Bodies.rectangle(0, 300, 20, 1200, { isStatic: true, render: { visible: false } })
    const rightWall = Bodies.rectangle(800, 300, 20, 1200, { isStatic: true, render: { visible: false } })
    Composite.add(world, [ground, leftWall, rightWall])

    // Add mouse control
    const mouse = Matter.Mouse.create(render.canvas)
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: { stiffness: 0.2, render: { visible: false } }
    })
    Composite.add(world, mouseConstraint)
    
    // 3. Implement Start Conditions
    if (activeMode.start_condition && gameConfig.start_conditions[activeMode.start_condition]) {
      const startCondition = gameConfig.start_conditions[activeMode.start_condition];
      startCondition.forEach(startBlock => {
        const blockConfig = gameConfig.block_library[startBlock.block_id];
        if (blockConfig) {
          const block = createBlock(blockConfig, startBlock.position);
          Composite.add(world, block);
        }
      });
    }

    // Cleanup
    return () => {
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
    if (engineRef.current && activeMode) {
      // Pick a random block from the allowed list
      const blockId = activeMode.spawner.allowed_blocks[Math.floor(Math.random() * activeMode.spawner.allowed_blocks.length)];
      const blockConfig = gameConfig.block_library[blockId];
      
      if (blockConfig) {
        const position = { x: Math.random() * 700 + 50, y: 50 }
        const block = createBlock(blockConfig, position)
        Composite.add(engineRef.current.world, block)
      }
    }
  }

  return (
    <div>
      {activeMode ? (
        <>
          <h1>{activeMode.name}</h1>
          <p>{activeMode.description}</p>
          <button onClick={spawnBlock}>Spawn Block</button>
        </>
      ) : (
        <h1>Loading Game...</h1>
      )}
      <div ref={sceneRef} style={{ width: '800px', height: '600px' }}></div>
    </div>
  )
}

export default App
