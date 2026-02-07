# Yellow Network Integration Guide

FlashPoint integrates with [Yellow Network](https://yellow.org/) using the Nitrolite protocol to enable instant, gas-free collaborative gaming with performance-based rewards through state channels.

## Overview

The integration enables:
- **Instant Entry**: Lock $1 USDC into a state channel to play
- **Performance Rewards**: Earn up to 2x multiplier based on tower height
- **Off-chain Gameplay**: All game state updates happen off-chain
- **Instant Settlement**: Final payouts calculated and distributed instantly
- **On-chain Finality**: Settle balances on-chain when ready

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Player 1      │     │   ClearNode     │     │   Player 2      │
│   (Wallet)      │◄───►│  (Yellow Net)   │◄───►│   (Wallet)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                      │                        │
         │                      ▼                        │
         │              ┌─────────────────┐              │
         └──────────────►│  Nitrolite     │◄─────────────┘
                        │  Smart Contract │
                        └─────────────────┘
```

## Key Components

### 1. Nitrolite Client (`src/services/nitroliteClient.js`)

The main client for interacting with Yellow Network:

```javascript
import { nitroliteClient, DEFAULT_BET_AMOUNT } from './services/nitroliteClient'

// Initialize with wallet
nitroliteClient.initialize(walletClient, address)

// Connect to ClearNode
await nitroliteClient.connect()

// Create a game session (state channel)
const session = await nitroliteClient.createGameSession(opponentAddress, betAmount)

// Settle the game
const result = await nitroliteClient.settleGameSession({
  player1Score: 100,
  player2Score: 80,
  player1Address: '0x...',
  player2Address: '0x...'
}, betAmount)
```

### 2. useYellowSession Hook (`src/hooks/useYellowSession.js`)

React hook for managing Yellow Network sessions:

```javascript
import { useYellowSession, SessionState } from './hooks/useYellowSession'

function GameComponent() {
  const { 
    sessionState,
    isConnected,
    createGameSession,
    settleGame,
    formatBetAmount 
  } = useYellowSession()

  // Create session when match is found
  const handleMatchFound = async (opponent) => {
    await createGameSession(opponent.address)
  }

  // Settle when game ends
  const handleGameEnd = async (result) => {
    await settleGame(result)
  }
}
```

### 3. YellowNetworkProvider (`src/providers/YellowNetworkProvider.jsx`)

Global context provider for Yellow Network state:

```jsx
import { YellowNetworkProvider, useYellowNetwork } from './providers/YellowNetworkProvider'

function App() {
  return (
    <WalletProvider>
      <YellowNetworkProvider>
        <Game />
      </YellowNetworkProvider>
    </WalletProvider>
  )
}
```

### 4. GameSettlement Component (`src/components/game/GameSettlement.jsx`)

UI component for settling games:

```jsx
<GameSettlement
  gameResult={gameResult}
  sessionId={sessionId}
  player1Address={myAddress}
  player2Address={opponentAddress}
  betAmount={betAmount}
  onSettlementComplete={handleComplete}
/>
```

## Game Flow

### 1. Pre-Game: Creating a State Channel

When two players are matched:

1. Both players connect to ClearNode
2. An Application Session (state channel) is created
3. Both players' bets are locked in the channel
4. Game begins

### 2. During Game: Off-Chain State Updates

Game state can be synced off-chain:
- Tower heights
- Block positions
- Turn information

No gas fees for any in-game actions!

### 3. Post-Game: Settlement

When the game ends:

1. Final scores are calculated (tower heights)
2. Payouts are computed proportionally:
   - If P1 built 70% of total height, P1 gets 70% of pot
   - 2% protocol fee is deducted
3. State channel is closed with final allocations
4. Players can withdraw funds on-chain

## Payout Calculation - Performance-Based Rewards

FlashPoint is a **collaborative** game - both players build the same tower together and earn **performance-based multipliers**:

### Reward Tiers

| Tower Height | Tier | Multiplier | Payout (each) |
|--------------|------|------------|---------------|
| 0-99px | Starter | 1.0x | $0.98 (-2% fee) |
| 100-199px | Builder | 1.2x | $1.14 (+14%) |
| 200-299px | Expert | 1.5x | $1.43 (+43%) |
| 300px+ | Master | 2.0x | $1.90 (+90%) |

### How It Works

```javascript
// Reward tiers with multipliers
const REWARD_TIERS = [
  { name: 'Starter', minHeight: 0, multiplier: 1.0 },
  { name: 'Builder', minHeight: 100, multiplier: 1.2 },
  { name: 'Expert', minHeight: 200, multiplier: 1.5 },
  { name: 'Master', minHeight: 300, multiplier: 2.0 },
]

// Calculate rewards based on tower height
const tier = getRewardTier(towerHeight)
const totalEntryFees = entryFee * 2  // Both players' $1 = $2
const totalRewards = totalEntryFees * tier.multiplier

// Protocol only takes 5% of the BONUS portion
const bonusPortion = totalRewards - totalEntryFees
const protocolFee = bonusPortion > 0 ? bonusPortion * 0.05 : 0

// Equal split
const playerPayout = (totalRewards - protocolFee) / 2
```

### Economics

- **Entry Fee**: $1 USDC per player
- **Base Pool**: $2 USDC (combined entry)
- **Reward Source**: Protocol treasury funds bonuses for high performance
- **Protocol Fee**: 5% of bonus only (not base stake)

This creates meaningful earning potential while rewarding skill!

## Configuration

### Environment Variables

Create a `.env.local` file:

```bash
# ClearNode WebSocket URL
VITE_CLEARNODE_URL=wss://clearnet-test.yellow.com/ws

# Default bet amount (in USDC with 6 decimals)
VITE_DEFAULT_BET_AMOUNT=1000000

# Enable debug logging
VITE_DEBUG=true
```

### Supported Networks

- **Base Sepolia** (Testnet) - Recommended for development
- **Base** (Mainnet) - For production

## Testing

### Local Development

1. Connect to Base Sepolia testnet
2. Get test USDC from a faucet
3. Start the frontend: `npm run dev`

### Integration Testing

The game can run in "demo mode" without a state channel for testing:
- Skip settlement if no sessionId
- All game mechanics work offline

## Security

### State Channel Security

- All state updates require signatures from both parties
- Channel can be challenged if counterparty is unresponsive
- Funds are secured by smart contracts

### Wallet Integration

- Uses standard EIP-191 message signing
- Compatible with MetaMask and other Web3 wallets
- Session keys can be used for frequent operations

## Troubleshooting

### Connection Issues

```javascript
// Check connection status
if (!nitroliteClient.isReady()) {
  await nitroliteClient.connect()
}
```

### Settlement Failures

If settlement fails:
1. Check both players have signed
2. Verify session is still active
3. Retry with exponential backoff

## Resources

- [Yellow Network Docs](https://docs.yellow.org/)
- [Nitrolite Protocol](https://docs.yellow.org/nitrolite)
- [ERC-7824 Standard](https://eips.ethereum.org/EIPS/eip-7824)
- [Yellow SDK on npm](https://www.npmjs.com/package/@erc7824/nitrolite)
