import { useState, useEffect } from 'react'
import yaml from 'js-yaml'

/**
 * Hook to load game configuration from YAML files
 */
export const useGameConfig = () => {
  const [gameConfig, setGameConfig] = useState(null)
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load strategy config
  useEffect(() => {
    setLoading(true)
    
    fetch('/configs/strategy.yaml')
      .then((response) => response.text())
      .then((text) => {
        const fullConfig = yaml.load(text)
        setGameConfig(fullConfig)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load strategy.yaml:', err)
        setError(err)
        setLoading(false)
      })
  }, [])

  // Load levels config
  useEffect(() => {
    fetch('/configs/levels.yaml')
      .then((res) => res.text())
      .then((text) => {
        try {
          const parsed = yaml.load(text)
          const loaded = parsed && parsed.levels ? parsed.levels : []
          setLevels(loaded)
        } catch (e) {
          console.warn('Failed to parse levels.yaml', e)
        }
      })
      .catch(() => {
        // no levels file — that's fine
      })
  }, [])

  /**
   * Get a game mode by ID
   */
  const getGameMode = (modeId) => {
    return gameConfig?.game_modes?.find(m => m.id === modeId) || null
  }

  /**
   * Get the default active game mode
   */
  const getDefaultMode = () => {
    if (!gameConfig) return null
    return gameConfig.game_modes?.find(m => m.id === gameConfig.active_game_mode) || null
  }

  /**
   * Get block config from library
   */
  const getBlockConfig = (blockId) => {
    return gameConfig?.block_library?.[blockId] || null
  }

  /**
   * Get start condition blocks
   */
  const getStartCondition = (conditionId) => {
    return gameConfig?.start_conditions?.[conditionId] || null
  }

  return {
    gameConfig,
    levels,
    loading,
    error,
    getGameMode,
    getDefaultMode,
    getBlockConfig,
    getStartCondition
  }
}

export default useGameConfig
