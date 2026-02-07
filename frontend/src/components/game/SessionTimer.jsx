import React from 'react'

/**
 * Session timer display component
 */
function SessionTimer({ sessionTime }) {
  if (sessionTime === null || sessionTime <= 0) return null

  const isLowTime = sessionTime <= 5

  return (
    <div className={`text-4xl font-bold mb-4 ${isLowTime ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
      ⏱️ {sessionTime}s
    </div>
  )
}

export default SessionTimer
