# 🏗️ FlashPoint

**FlashPoint** is a high-stakes, 1v1 real-time strategy game where players build "Liquidity Towers" using hexagonal blocks streamed directly from live market data. Powered by [**Yellow Network**](https://www.yellow.org/), it merges DeFi liquidity events with physics-based competitive gaming.

Built for [the HackMoney 2026 hackathon](https://ethglobal.com/events/hackmoney2026) by [ETHGlobal](https://ethglobal.com).

## 🎮 Game Overview

In a 1v1 arena, a **Central Liquidity Pool** streams hexagonal blocks. Players must grab, rotate, and stack these blocks on their platforms. The stability of your tower represents your "position" in the market. 

* **The Goal:** Build the highest, most stable tower within the time limit.
* **The Twist:** Block physics (mass, friction, bounciness) are dictated by real-time market volatility via the **Yellow Network** L3 Oracle.


## 🛠️ Core Mechanics

### 1. Liquidity Streaming (The Oracle)

The game uses **Yellow Network's ClearSync** to pull real-time trading data.

* **Buy Orders:** Spawn "Stable" blocks (high friction, easy to stack).
* **Sell Orders/Volatility:** Spawn "Volatile" blocks (slippery, low friction, heavy).
* **Liquidity Surges:** Temporary speed boosts to the block spawn rate when volume spikes.

### 2. Strategy Engine (Collectible NFTs)

Game rules are decoupled from the code, allowing for rapid balancing and community-made "market conditions."

```yaml
# example_strategy.yaml
match_config:
  mode: "High_Volatility_Stress_Test"
  physics:
    gravity: 9.8
    base_friction: 0.3
  rules:
    win_condition: "max_height_at_timer"
    session_duration: 180
  payouts:
    distribution: "skill_proportional"
    loser_rebate: 0.10
```

### 3. Stake-to-Stack Betting

Players enter a match by locking tokens into a Yellow Network State Channel.

Skill-Based Payouts: Rewards are not winner-takes-all. The pot is distributed based on the ratio of tower heights (e.g., if you built 70% of the total height between both players, you take 70% of the pot).

Loser Rewards: Even the losing player receives a portion of their stake back and "Fragment" tokens for participation, preventing rage-quitting and incentivizing long-term play.

## 🏗️ Technical Architecture

* Frontend: React + Three.js (for 3D rendering) or Phaser (for 2D logic).
* Backend: Node.js with Socket.io for ultra-low latency 1v1 synchronization.
* L3 Integration: Yellow Network SDK for real-time liquidity data and peer-to-peer settlement via state channels.
* Physics Engine: Matter.js or Cannon.js to handle hexagonal collisions and stability.

## 💰 Economic Model

| Feature      | Description                                                              |
|--------------|--------------------------------------------------------------------------|
| The Stake    | Equal buy-in from both players (e.g., 50 YELLOW tokens each).            |
| The Split    | Final payout calculated by the ratio of successful blocks stacked.       |
| The Burn     | A 2% fee is taken from the pot to fund the ecosystem treasury.           |
| Consolation  | Losers receive "Broken Hex" (off-chain fragments) for cosmetic upgrades. |

## 🚀 Getting Started

### Prerequisites

* Node.js v18+
* A Yellow Network API Key (for ClearSync access)

### Installation

1. Clone the repo: `git clone https://github.com/MatthieuScarset/flash-point.git`
1. Install dependencies: `npm install`
1. Configure your Strategy: Edit `src/configs/rules.yaml` to adjust block physics and reward ratios.
1. Run the local dev server: `npm run start`

Frontend (React): Change directory into `frontend/`, then run:

```
cd frontend
npm install
npm run dev
```

This will start the Vite dev server for the UI (port 5173 by default).

## 🛣️ Roadmap

### Phase 1: The Physics Foundation

* **Goal:** Single-player local MVP.

* **Tasks:**
  * Initialize Matter.js world with a static ground (The Platform).
  * Create a `spawnHexagon()` function that generates 2D regular polygons.
  * Implement "MouseConstraint" to allow dragging/dropping for testing.

### Phase 1 bis: The Configurable gameplay

* **Goal:** Allow users to defined missions/modes of a game

* **Logic:**
  * Use a YAML-defined set of rules and attributes which is selected and parsed on game load. 
  * 


### Phase 2: Live Market Mapping

* **Goal:** Turn trade data into block properties.

* **Logic:**
  * `side: buy` ➔ Stable Block (High friction 0.9, low bounce).
  * `side: sell` ➔ Volatile Block (Low friction 0.1, high bounce).
  * `quantity` ➔ Mass/Scale (Larger trades = bigger, heavier blocks).

### Phase 3: 1v1 Multi-player
* **Goal:** Sync two players in a single arena.
* **Tasks:**
  * Server-side "Master Clock" to ensure both players get identical block sequences.
  * Sync block "settle" positions (x, y, rotation) via Socket.io to render the opponent's tower.

### Phase 4: Yellow Network Integration
* **Staking:** Use Nitrolite SDK to open a state channel for the pot.
* **End Game:** Calculate final height ratio ($H_1 / (H_1 + H_2)$).
* **Settlement:** Call `settle()` to distribute tokens proportionally to players' wallets.