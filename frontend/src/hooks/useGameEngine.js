import { useRef, useEffect, useCallback, useState } from 'react'
import Matter from 'matter-js'
import { createBlock, resolvePosition, serializeBlockStates } from '../utils/blockUtils'

const Bodies = Matter.Bodies
const Composite = Matter.Composite

/**
 * Hook to manage Matter.js physics engine
 */
export const useGameEngine = (containerRef, gameConfig, activeMode, isActive = true) => {
  const engineRef = useRef(null)
  const renderRef = useRef(null)
  const runnerRef = useRef(null)
  const mouseConstraintRef = useRef(null)
  const [draggedBody, setDraggedBody] = useState(null)
  const [isEngineReady, setIsEngineReady] = useState(false)

  // Get container size
  const getSize = useCallback(() => {
    if (!containerRef.current) return { width: 320, height: 640 }
    
    const container = containerRef.current
    const ASPECT = 9 / 16
    const maxWidth = Math.min(360, Math.round(window.innerWidth * 0.6))
    const width = container.clientWidth || maxWidth || 320
    let height = container.clientHeight || 0

    if (!height || height === 0) {
      height = Math.round(width / ASPECT)
      const maxH = Math.round(window.innerHeight * 0.9)
      height = Math.min(height, maxH)
    }

    return { width, height }
  }, [containerRef])

  // Setup physics engine
  useEffect(() => {
    if (!isActive || !containerRef.current || !gameConfig || !activeMode) return

    const Engine = Matter.Engine
    const Render = Matter.Render
    const Runner = Matter.Runner

    const engine = Engine.create()
    engineRef.current = engine
    const world = engine.world

    const container = containerRef.current
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
    renderRef.current = render

    // Helper to set render size
    const setRenderSize = (width, height) => {
      const ratio = window.devicePixelRatio || 1
      const pixelWidth = Math.max(200, Math.round(width * ratio))
      const pixelHeight = Math.max(400, Math.round(height * ratio))

      render.options.width = width
      render.options.height = height
      render.bounds.max.x = width
      render.bounds.max.y = height
      render.canvas.width = pixelWidth
      render.canvas.height = pixelHeight

      if (render.context && render.context.setTransform) {
        render.context.setTransform(ratio, 0, 0, ratio, 0, 0)
      }

      render.canvas.style.width = `${width}px`
      render.canvas.style.height = `${height}px`
      render.canvas.style.display = 'block'
    }

    setRenderSize(size.width, size.height)
    Render.run(render)
    
    const runner = Runner.create()
    runnerRef.current = runner
    Runner.run(runner, engine)

    // Add ground and walls
    const groundHeight = Math.max(20, Math.round(size.height * 0.06))
    const groundY = size.height - Math.round(groundHeight / 2)

    let ground = Bodies.rectangle(size.width / 2, groundY, size.width, groundHeight, { 
      isStatic: true, 
      render: { fillStyle: '#2b2f35', strokeStyle: '#6ea0d6', lineWidth: 2 } 
    })
    let topWall = Bodies.rectangle(size.width / 2, -10, size.width * 2, 20, { 
      isStatic: true, 
      render: { visible: false } 
    })
    let leftWall = Bodies.rectangle(-10, size.height / 2, 20, size.height * 2, { 
      isStatic: true, 
      render: { visible: false } 
    })
    let rightWall = Bodies.rectangle(size.width + 10, size.height / 2, 20, size.height * 2, { 
      isStatic: true, 
      render: { visible: false } 
    })
    Composite.add(world, [ground, topWall, leftWall, rightWall])

    // Add mouse control
    const mouse = Matter.Mouse.create(render.canvas)
    mouse.pixelRatio = window.devicePixelRatio || 1
    
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: { stiffness: 0.2, render: { visible: false } }
    })
    mouseConstraintRef.current = mouseConstraint
    Composite.add(world, mouseConstraint)
    render.mouse = mouse

    // Drag events
    const onStartDrag = (event) => setDraggedBody(event.body)
    const onEndDrag = () => setDraggedBody(null)

    Matter.Events.on(mouseConstraint, 'startdrag', onStartDrag)
    Matter.Events.on(mouseConstraint, 'enddrag', onEndDrag)

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current) return
      const { width, height } = getSize()
      setRenderSize(width, height)

      Composite.remove(world, [ground, topWall, leftWall, rightWall])
      ground = Bodies.rectangle(width / 2, height - 30, width, 60, { 
        isStatic: true, 
        render: { fillStyle: '#222', strokeStyle: '#555', lineWidth: 4 } 
      })
      topWall = Bodies.rectangle(width / 2, -10, width * 2, 20, { 
        isStatic: true, 
        render: { visible: false } 
      })
      leftWall = Bodies.rectangle(-10, height / 2, 20, height * 2, { 
        isStatic: true, 
        render: { visible: false } 
      })
      rightWall = Bodies.rectangle(width + 10, height / 2, 20, height * 2, { 
        isStatic: true, 
        render: { visible: false } 
      })
      Composite.add(world, [ground, topWall, leftWall, rightWall])
      mouse.element = render.canvas
    }

    window.addEventListener('resize', handleResize)
    setTimeout(handleResize, 0)

    // Add start condition blocks
    if (activeMode.start_condition && gameConfig.start_conditions?.[activeMode.start_condition]) {
      const startCondition = gameConfig.start_conditions[activeMode.start_condition]
      const { width, height } = getSize()
      const groundH = Math.max(20, Math.round(height * 0.06))

      startCondition.forEach(startBlock => {
        const blockConfig = gameConfig.block_library[startBlock.block_id]
        if (blockConfig && startBlock.position) {
          const position = resolvePosition(startBlock.position, width, height, groundH)
          const block = createBlock(blockConfig, position)
          Composite.add(world, block)
        }
      })
    }

    setIsEngineReady(true)

    // Cleanup
    return () => {
      setIsEngineReady(false)
      window.removeEventListener('resize', handleResize)
      Matter.Events.off(mouseConstraint, 'startdrag', onStartDrag)
      Matter.Events.off(mouseConstraint, 'enddrag', onEndDrag)
      Render.stop(render)
      Runner.stop(runner)
      Composite.clear(world, false)
      Engine.clear(engine)
      render.canvas.remove()
      render.textures = {}
      engineRef.current = null
      renderRef.current = null
      runnerRef.current = null
      mouseConstraintRef.current = null
    }
  }, [isActive, gameConfig, activeMode, containerRef, getSize])

  // Spawn a block
  const spawnBlock = useCallback((blockConfig, position) => {
    if (!engineRef.current) return null
    const block = createBlock(blockConfig, position)
    Composite.add(engineRef.current.world, block)
    return block
  }, [])

  // Get all block states
  const getBlockStates = useCallback(() => {
    if (!engineRef.current) return []
    const bodies = Composite.allBodies(engineRef.current.world)
    return serializeBlockStates(bodies)
  }, [])

  // Apply block states
  const applyBlockStates = useCallback((blockStates) => {
    if (!engineRef.current) return
    const bodies = Composite.allBodies(engineRef.current.world)
    
    blockStates.forEach(state => {
      const body = bodies.find(b => b.id === state.id)
      if (body && !body.isStatic) {
        Matter.Body.setPosition(body, { x: state.x, y: state.y })
        Matter.Body.setAngle(body, state.angle)
        if (state.velocityX !== undefined) {
          Matter.Body.setVelocity(body, { x: state.velocityX, y: state.velocityY })
        }
      }
    })
  }, [])

  // Enable/disable mouse controls
  const setMouseEnabled = useCallback((enabled) => {
    if (!engineRef.current || !mouseConstraintRef.current) return
    
    const world = engineRef.current.world
    const mouseConstraint = mouseConstraintRef.current
    const bodies = Composite.allBodies(world)

    if (enabled) {
      if (!bodies.includes(mouseConstraint)) {
        Composite.add(world, mouseConstraint)
      }
    } else {
      Composite.remove(world, mouseConstraint)
    }
  }, [])

  // Clear all non-static bodies
  const clearBlocks = useCallback(() => {
    if (!engineRef.current) return
    const world = engineRef.current.world
    const bodies = Composite.allBodies(world)
    bodies.forEach(b => {
      if (!b.isStatic) {
        Composite.remove(world, b)
      }
    })
  }, [])

  return {
    engine: engineRef.current,
    isEngineReady,
    draggedBody,
    getSize,
    spawnBlock,
    getBlockStates,
    applyBlockStates,
    setMouseEnabled,
    clearBlocks
  }
}

export default useGameEngine
