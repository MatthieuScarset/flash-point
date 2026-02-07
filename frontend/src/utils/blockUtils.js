import Matter from 'matter-js'

const Bodies = Matter.Bodies

export const BLOCK_DEFAULT_RADIUS = 18
export const BLOCK_DEFAULT_WIDTH = 32
export const BLOCK_DEFAULT_HEIGHT = 32

/**
 * Create a Matter.js body from a block configuration
 */
export const createBlock = (blockConfig, position) => {
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

/**
 * Resolve a position that may contain percentage values
 */
export const resolvePosition = (pos, width, height, groundHeight = 0) => {
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

  const x = clamp(rawX, padding, width - padding)
  const y = clamp(rawY, padding, height - groundHeight - padding)
  
  return { x, y }
}

/**
 * Calculate spawn position for a new block
 */
export const calculateSpawnPosition = (containerWidth, containerHeight) => {
  const groundH = Math.max(20, Math.round(containerHeight * 0.06))
  const padding = 40
  const x = Math.random() * Math.max(0, containerWidth - padding * 2) + padding
  const yTop = Math.max(30, Math.round(containerHeight * 0.08))
  const y = Math.min(yTop, containerHeight - groundH - padding)
  
  return { x, y }
}

/**
 * Serialize block states for network sync
 */
export const serializeBlockStates = (bodies) => {
  return bodies
    .filter(b => !b.isStatic)
    .map(b => ({
      id: b.id,
      label: b.label,
      x: b.position.x,
      y: b.position.y,
      angle: b.angle,
      velocityX: b.velocity.x,
      velocityY: b.velocity.y
    }))
}

/**
 * Apply serialized block states to physics bodies
 */
export const applyBlockStates = (bodies, blockStates) => {
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
}
