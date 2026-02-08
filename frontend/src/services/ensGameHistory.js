/**
 * ENS Game History Service
 * 
 * Saves FlashPoint game results to ENS TEXT records
 * so players have a permanent on-chain history of their games.
 * 
 * Uses the 'com.flashpoint.games' TEXT record to store game history
 */

import { normalize } from 'viem/ens'

// ENS Public Resolver ABI (only setText function)
const ENS_RESOLVER_ABI = [
  {
    name: 'setText',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'text',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ type: 'string' }],
  },
]

// ENS Registry ABI
const ENS_REGISTRY_ABI = [
  {
    name: 'resolver',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ type: 'address' }],
  },
]

// ENS contract addresses
const ENS_REGISTRY = {
  1: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e', // Mainnet
  11155111: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e', // Sepolia
}

// Text record key for FlashPoint games
const FLASHPOINT_RECORD_KEY = 'com.flashpoint.games'

/**
 * Calculate ENS namehash
 */
function namehash(name) {
  if (!name) {
    return '0x0000000000000000000000000000000000000000000000000000000000000000'
  }
  
  const labels = name.split('.')
  let node = '0x0000000000000000000000000000000000000000000000000000000000000000'
  
  for (let i = labels.length - 1; i >= 0; i--) {
    const labelHash = keccak256(labels[i])
    node = keccak256Concat(node, labelHash)
  }
  
  return node
}

// Simple keccak256 using crypto API
async function keccak256(data) {
  const { keccak256: viemKeccak256 } = await import('viem')
  if (typeof data === 'string') {
    const { stringToBytes } = await import('viem')
    return viemKeccak256(stringToBytes(data))
  }
  return viemKeccak256(data)
}

async function keccak256Concat(a, b) {
  const { keccak256: viemKeccak256, concat } = await import('viem')
  return viemKeccak256(concat([a, b]))
}

/**
 * Game history entry structure
 */
export function createGameHistoryEntry({
  sessionId,
  towerHeight,
  blocksPlaced,
  turns,
  rewardTier,
  payout,
  partnerAddress,
  chainId,
  timestamp = Date.now(),
}) {
  return {
    v: 1, // Version
    sid: sessionId?.slice(0, 18), // Shortened session ID
    h: towerHeight, // Height
    b: blocksPlaced, // Blocks
    t: turns, // Turns
    r: rewardTier?.label || '✅', // Reward tier
    p: payout, // Payout in wei
    w: partnerAddress?.slice(0, 10), // Partner (shortened)
    c: chainId,
    ts: Math.floor(timestamp / 1000), // Unix timestamp
  }
}

/**
 * ENS Game History Manager
 */
class ENSGameHistory {
  constructor() {
    this.publicClient = null
    this.walletClient = null
  }

  /**
   * Initialize with viem clients
   */
  initialize(publicClient, walletClient) {
    this.publicClient = publicClient
    this.walletClient = walletClient
  }

  /**
   * Get ENS name for an address
   */
  async getENSName(address) {
    if (!this.publicClient) return null
    
    try {
      const name = await this.publicClient.getEnsName({ address })
      return name
    } catch (err) {
      console.log('No ENS name for address:', address)
      return null
    }
  }

  /**
   * Get current game history from ENS
   */
  async getGameHistory(ensName) {
    if (!this.publicClient || !ensName) return []

    try {
      const text = await this.publicClient.getEnsText({
        name: normalize(ensName),
        key: FLASHPOINT_RECORD_KEY,
      })

      if (!text) return []

      // Parse JSON array of game entries
      return JSON.parse(text)
    } catch (err) {
      console.warn('Failed to get game history from ENS:', err.message)
      return []
    }
  }

  /**
   * Save a new game to ENS history
   * Appends to existing history, keeping last 50 games
   */
  async saveGameToHistory(ensName, gameEntry) {
    if (!this.walletClient || !ensName) {
      console.warn('Cannot save to ENS: wallet not connected or no ENS name')
      return { success: false, error: 'No ENS name' }
    }

    try {
      console.log('📝 Saving game to ENS:', ensName, gameEntry)

      // Get existing history
      const existingHistory = await this.getGameHistory(ensName)
      
      // Add new entry and keep last 50
      const newHistory = [gameEntry, ...existingHistory].slice(0, 50)
      const historyJson = JSON.stringify(newHistory)

      // Get resolver address
      const { namehash: viemNamehash } = await import('viem/ens')
      const node = viemNamehash(normalize(ensName))
      
      const chainId = await this.publicClient.getChainId()
      const registryAddress = ENS_REGISTRY[chainId]
      
      if (!registryAddress) {
        console.warn('ENS not supported on this chain:', chainId)
        return { success: false, error: 'Chain not supported' }
      }

      // Get resolver
      const resolverAddress = await this.publicClient.readContract({
        address: registryAddress,
        abi: ENS_REGISTRY_ABI,
        functionName: 'resolver',
        args: [node],
      })

      if (!resolverAddress || resolverAddress === '0x0000000000000000000000000000000000000000') {
        console.warn('No resolver set for:', ensName)
        return { success: false, error: 'No resolver' }
      }

      // Write to resolver
      const hash = await this.walletClient.writeContract({
        address: resolverAddress,
        abi: ENS_RESOLVER_ABI,
        functionName: 'setText',
        args: [node, FLASHPOINT_RECORD_KEY, historyJson],
      })

      console.log('✅ Game saved to ENS! TX:', hash)
      
      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      
      return {
        success: true,
        txHash: hash,
        blockNumber: receipt.blockNumber,
        gamesStored: newHistory.length,
      }
    } catch (err) {
      console.error('Failed to save to ENS:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Format game history for display
   */
  formatHistoryEntry(entry) {
    const date = new Date(entry.ts * 1000)
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
      towerHeight: entry.h,
      blocksPlaced: entry.b,
      turns: entry.t,
      rewardTier: entry.r,
      payout: (parseInt(entry.p || 0) / 1_000_000).toFixed(2),
      partner: entry.w,
    }
  }
}

// Singleton instance
export const ensGameHistory = new ENSGameHistory()
export default ensGameHistory
