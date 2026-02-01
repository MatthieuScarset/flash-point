import React, { useEffect, useRef } from 'react'
import Matter from 'matter-js'
import './style.css'

function App() {
  const sceneRef = useRef(null)
  const engineRef = useRef(null)

  useEffect(() => {
    // Matter.js setup
    const Engine = Matter.Engine
    const Render = Matter.Render
    const Runner = Matter.Runner
    const Bodies = Matter.Bodies
    const Composite = Matter.Composite

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

    // Add ground
    const ground = Bodies.rectangle(400, 600, 810, 60, { isStatic: true })
    Composite.add(world, ground)

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
  }, [])

  const spawnHexagon = () => {
    if (engineRef.current) {
      const Bodies = Matter.Bodies
      const Composite = Matter.Composite
      const hexagon = Bodies.polygon(Math.random() * 700 + 50, 50, 6, 30)
      Composite.add(engineRef.current.world, hexagon)
    }
  }

  return (
    <div>
      <h1>FlashPoint - Phase 1: The Physics Foundation</h1>
      <button onClick={spawnHexagon}>Spawn Hexagon</button>
      <div ref={sceneRef} style={{ width: '800px', height: '600px' }}></div>
    </div>
  )
}

export default App