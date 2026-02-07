import React, { forwardRef } from 'react'

/**
 * Game canvas container component
 */
const GameCanvas = forwardRef((props, ref) => {
  return (
    <main className='w-full flex justify-center'>
      <article ref={ref} className='scene'></article>
    </main>
  )
})

GameCanvas.displayName = 'GameCanvas'

export default GameCanvas
