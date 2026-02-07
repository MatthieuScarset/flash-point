import { useState, useEffect, useRef, useCallback } from 'react'
import { checkGameResult } from '../utils/gameUtils'

/**
 * Hook to manage game session (timer, results)
 */
export const useGameSession = (engine, containerRef, activeMode, turnCount, isActive = true) => {
  const [sessionTime, setSessionTime] = useState(null)
  const [gameResult, setGameResult] = useState(null)
  const sessionTimerRef = useRef(null)

  // Initialize and run session timer
  useEffect(() => {
    if (!isActive || !activeMode) return

    const sessionDuration = activeMode.rules?.session_duration
    if (!sessionDuration) return

    setSessionTime(sessionDuration)
    setGameResult(null)

    sessionTimerRef.current = setInterval(() => {
      setSessionTime(prev => {
        if (prev <= 1) {
          clearInterval(sessionTimerRef.current)
          sessionTimerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current)
        sessionTimerRef.current = null
      }
    }
  }, [isActive, activeMode])

  // Check result when session ends
  useEffect(() => {
    if (sessionTime !== 0 || !isActive || gameResult) return

    const resultTimeout = setTimeout(() => {
      const containerHeight = containerRef.current?.clientHeight || 600
      const result = checkGameResult(engine, containerHeight, activeMode, turnCount)
      if (result) {
        setGameResult(result)
      }
    }, 500)

    return () => clearTimeout(resultTimeout)
  }, [sessionTime, isActive, gameResult, engine, containerRef, activeMode, turnCount])

  // Reset session
  const resetSession = useCallback(() => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
    setSessionTime(null)
    setGameResult(null)
  }, [])

  const isTimeUp = sessionTime === 0
  const isGameOver = isTimeUp && gameResult !== null

  return {
    sessionTime,
    gameResult,
    isTimeUp,
    isGameOver,
    resetSession
  }
}

export default useGameSession
