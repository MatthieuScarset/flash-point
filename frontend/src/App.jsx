import React, { useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import yaml from 'js-yaml'
import './style.css'

function App() {
  const sceneRef = useRef(null)
  const engineRef = useRef(null)
  const [config, setConfig] = useState(null)

  useEffect(() => {
    fetch('/configs/strategy.yaml')
      .then((response) => response.text())
      .then((text) => {
        setConfig(yaml.load(text))
      })
  }, [])

  useEffect(() => {
    if (!config) return

    // Matter.js setup
    const Engine = Matter.Engine
    const Render = Matter.Render
    const Runner = Matter.Runner
    const Bodies = Matter.Bodies
    const Composite = Matter.Composite

    const engine = Engine.create()
    engineRef.current = engine
    const world = engine.world
    engine.gravity.x = config.world.physics.gravity.x
    engine.gravity.y = config.world.physics.gravity.y

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
    const ground = Bodies.rectangle(
      400, // x
      600, // y
      config.world.platform.width,
      config.world.platform.height,
      { isStatic: true }
    )
    const leftWall = Bodies.rectangle(0, 300, 20, 1200, { isStatic: true, render: { visible: false } });
    const rightWall = Bodies.rectangle(800, 300, 20, 1200, { isStatic: true, render: { visible: false } });
    Composite.add(world, [ground, leftWall, rightWall])

    // Add mouse control
    const mouse = Matter.Mouse.create(render.canvas)
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.2,
        render: {
          visible: false
        }
      }
    })
    Composite.add(world, mouseConstraint)

    // Cleanup
    return () => {
      Render.stop(render)
      Runner.stop(runner)
      Composite.clear(world, false)
      Engine.clear(engine)
      render.canvas.remove()
      render.textures = {}
    }
  }, [config])

  const spawnHexagon = () => {
    if (engineRef.current && config) {
      const Bodies = Matter.Bodies
      const Composite = Matter.Composite
      
      const blockType = Math.random() < 0.5 ? 'stable' : 'volatile'
      const blockConfig = config.blocks[blockType]
      const radius = config.blocks.sizing.min_radius + Math.random() * (config.blocks.sizing.max_radius - config.blocks.sizing.min_radius)

      const hexagon = Bodies.polygon(
        Math.random() * 700 + 50, // x
        50, // y
        6, // sides
        radius,
        {
          friction: blockConfig.friction,
          restitution: blockConfig.restitution,
          render: blockConfig.render
        }
      )
      Composite.add(engineRef.current.world, hexagon)
    }
  }

  return (
    <div>
      <h1>FlashPoint - Phase 1 Bis: Configurable Physics</h1>
      <button onClick={spawnHexagon} disabled={!config}>
        {config ? 'Spawn Hexagon' : 'Loading Config...'}
      </button>
      <div ref={sceneRef} style={{ width: '800px', height: '600px' }}></div>
    </div>
  )
}

export default App