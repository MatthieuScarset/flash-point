import Matter from 'matter-js'

const Composite = Matter.Composite

/**
 * Calculate the tower height from the physics world
 */
export const calculateTowerHeight = (engine, containerHeight) => {
  if (!engine) return 0
  
  const world = engine.world
  const bodies = Composite.allBodies(world)
  const groundY = containerHeight - Math.max(20, Math.round(containerHeight * 0.06))
  
  // Find the highest point (lowest Y value) among non-static bodies
  let highestY = groundY
  bodies.forEach(b => {
    if (!b.isStatic) {
      const topY = b.bounds.min.y
      if (topY < highestY) {
        highestY = topY
      }
    }
  })
  
  const towerHeight = Math.max(0, groundY - highestY)
  return Math.round(towerHeight)
}

/**
 * Count total non-static blocks in the world
 */
export const countTotalBlocks = (engine) => {
  if (!engine) return 0
  const world = engine.world
  const bodies = Composite.allBodies(world)
  return bodies.filter(b => !b.isStatic).length
}

/**
 * Count blocks of a specific type
 */
export const countBlocksOfType = (engine, blockId) => {
  if (!engine) return 0
  const world = engine.world
  const bodies = Composite.allBodies(world)
  return bodies.reduce((acc, b) => acc + (b.label === blockId ? 1 : 0), 0)
}

/**
 * Check game result based on win conditions
 */
export const checkGameResult = (engine, containerHeight, activeMode, turnCount) => {
  if (!activeMode) return null
  
  const towerHeight = calculateTowerHeight(engine, containerHeight)
  const totalBlocks = countTotalBlocks(engine)
  const winCondition = activeMode.rules?.win_condition || activeMode.win_condition
  
  const result = {
    towerHeight,
    totalBlocks,
    turnsPlayed: Math.floor(turnCount / 2) + 1,
    status: 'completed'
  }
  
  // Check specific win conditions
  if (winCondition?.type === 'max_height') {
    result.status = towerHeight > 100 ? 'great' : towerHeight > 50 ? 'good' : 'completed'
  } else if (winCondition?.type === 'count_blocks') {
    const target = winCondition.count || 10
    result.targetBlocks = target
    result.status = totalBlocks >= target ? 'won' : 'failed'
  }
  
  return result
}

/**
 * Check if level target has been achieved
 */
export const checkLevelWin = (engine, activeLevel) => {
  if (!activeLevel || !engine || !activeLevel.target) return false
  
  const t = activeLevel.target
  if (t.type === 'count_blocks') {
    const count = t.block_id 
      ? countBlocksOfType(engine, t.block_id) 
      : countTotalBlocks(engine)
    return count >= t.count
  }
  
  return false
}

/**
 * Get status text for game result
 */
export const getResultMessage = (status) => {
  switch (status) {
    case 'won': return '🎉 Congratulations!'
    case 'great': return '🌟 Amazing Tower!'
    case 'good': return '👍 Good Job!'
    case 'failed': return '😅 Nice Try!'
    default: return '⏰ Time\'s Up!'
  }
}
