# 79523 在线对战平台 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a monorepo prototype of the 79523 card game with engine (pure functions), server (Express + Socket.io), and client (Vue 3 + Vite).

**Architecture:** Three-package pnpm monorepo. Engine is a zero-dependency pure-function library for game rules. Server calls engine for all game logic, manages rooms and Socket.io connections. Client renders UI with Vue 3, references engine types for type safety.

**Tech Stack:** TypeScript, pnpm workspace, Vue 3 + Vite + Pinia, Express + Socket.io, Vitest (engine), Jest (server)

---

## Phase 1: Project Scaffold

### Task 1: Root monorepo setup

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize pnpm project**

```bash
cd /home/michael/Documents/repository/agent_harness/79523
pnpm init
```

Expected: `package.json` created.

- [ ] **Step 2: Edit package.json for monorepo**

Edit `package.json` to:
```json
{
  "name": "79523",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @79523/server dev & pnpm --filter @79523/client dev",
    "dev:server": "pnpm --filter @79523/server dev",
    "dev:client": "pnpm --filter @79523/client dev",
    "test": "pnpm --filter @79523/engine test && pnpm --filter @79523/server test",
    "test:engine": "pnpm --filter @79523/engine test",
    "test:server": "pnpm --filter @79523/server test"
  }
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.env
.DS_Store
```

- [ ] **Step 6: Install pnpm (if needed) and verify**

```bash
which pnpm || npm install -g pnpm
pnpm --version
```

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "chore: initialize monorepo scaffold"
```

---

## Phase 2: Engine Package

### Task 2: Engine package scaffold

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/vitest.config.ts`

- [ ] **Step 1: Create engine package.json**

```json
{
  "name": "@79523/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create engine tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

- [ ] **Step 4: Install dependencies**

```bash
cd /home/michael/Documents/repository/agent_harness/79523
pnpm install
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold engine package"
```

---

### Task 3: Engine types

**Files:**
- Create: `packages/engine/src/types.ts`
- Create: `packages/engine/src/__tests__/types.test.ts`

- [ ] **Step 1: Write the type definitions**

`packages/engine/src/types.ts`:
```typescript
export enum Suit {
  Spade = 0,    // ♠
  Heart = 1,    // ♥
  Club = 2,     // ♣
  Diamond = 3,  // ♦
}

// Rank enum values encode the game's card ordering.
// Higher value = stronger card.
// Order: 4 < 6 < 8 < 10 < J < Q < K < A < 3 < 2 < 5 < 9 < 7
export enum Rank {
  Four = 0,
  Six = 1,
  Eight = 2,
  Ten = 3,
  Jack = 4,
  Queen = 5,
  King = 6,
  Ace = 7,
  Three = 8,
  Two = 9,
  Five = 10,
  Nine = 11,
  Seven = 12,
}

export interface Card {
  suit: Suit
  rank: Rank
}

export enum HandType {
  Single = 'single',
  Pair = 'pair',
  Bike = 'bike',     // 单车: pair + any single
  Triple = 'triple',
  Root = 'root',     // 根号: two pairs + any single
}

export interface Play {
  type: HandType
  cards: Card[]
  primaryRank: Rank       // main rank for comparison
  secondaryRank?: Rank    // for Root: second pair's rank
}

export interface GameError {
  code: 'INVALID_CARDS' | 'WRONG_HAND_TYPE' | 'NOT_YOUR_TURN' | 'GAME_OVER'
  message: string
}

export enum BoxerMove {
  Rock = 'rock',
  Scissors = 'scissors',
  Paper = 'paper',
}

export enum GamePhase {
  Waiting = 'waiting',
  Dealing = 'dealing',
  Playing = 'playing',
  RoundEnd = 'round_end',
  Settling = 'settling',
}

export interface GameState {
  phase: GamePhase
  deck: Card[]
  players: PlayerGameState[]
  currentPlayerIndex: number
  currentBestPlay: Play | null
  bestPlayerId: string | null
  passCount: number
  tableCards: Card[]
  gameOver: boolean
}

export interface PlayerGameState {
  id: string
  hand: Card[]
  score: number
  totalScore: number
  finished: boolean
  hasBoxerBadge: boolean
}
```

- [ ] **Step 2: Write basic type validation test**

`packages/engine/src/__tests__/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { Suit, Rank, HandType, BoxerMove } from '../types'

describe('Suit ordering', () => {
  it('Spade is the highest suit', () => {
    expect(Suit.Spade).toBe(0)
  })

  it('Diamond is the lowest suit', () => {
    expect(Suit.Diamond).toBe(3)
  })
})

describe('Rank ordering', () => {
  it('Seven is the highest rank', () => {
    expect(Rank.Seven).toBe(12)
  })

  it('Four is the lowest rank', () => {
    expect(Rank.Four).toBe(0)
  })

  it('Nine is second highest', () => {
    expect(Rank.Nine).toBe(11)
  })

  it('Five is third highest', () => {
    expect(Rank.Five).toBe(10)
  })
})

describe('HandType values', () => {
  it('all hand types are defined', () => {
    expect(HandType.Single).toBe('single')
    expect(HandType.Pair).toBe('pair')
    expect(HandType.Bike).toBe('bike')
    expect(HandType.Triple).toBe('triple')
    expect(HandType.Root).toBe('root')
  })
})

describe('BoxerMove values', () => {
  it('all moves are defined', () => {
    expect(BoxerMove.Rock).toBe('rock')
    expect(BoxerMove.Scissors).toBe('scissors')
    expect(BoxerMove.Paper).toBe('paper')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd /home/michael/Documents/repository/agent_harness/79523
pnpm --filter @79523/engine test
```

Expected: 11 tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(engine): add core type definitions"
```

---

### Task 4: Deck operations

**Files:**
- Create: `packages/engine/src/deck.ts`
- Create: `packages/engine/src/__tests__/deck.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/engine/src/__tests__/deck.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createDeck, shuffle, draw } from '../deck'
import { Suit, Rank } from '../types'

describe('createDeck', () => {
  it('creates a 1-deck (52 cards) for 2-3 players', () => {
    const deck = createDeck(2)
    expect(deck.length).toBe(52)
  })

  it('creates a 1-deck (52 cards) for 3 players', () => {
    const deck = createDeck(3)
    expect(deck.length).toBe(52)
  })

  it('creates a 2-deck (104 cards) for 4 players', () => {
    const deck = createDeck(4)
    expect(deck.length).toBe(104)
  })

  it('creates a 2-deck (104 cards) for 6 players', () => {
    const deck = createDeck(6)
    expect(deck.length).toBe(104)
  })

  it('contains no joker cards', () => {
    const deck = createDeck(4)
    const hasJoker = deck.some(c => c.rank === undefined || c.rank === null)
    expect(hasJoker).toBe(false)
  })

  it('contains correct distribution: each rank appears 4 times per deck', () => {
    const deck = createDeck(2) // 1 deck
    const rankCount: Record<number, number> = {}
    for (const card of deck) {
      rankCount[card.rank] = (rankCount[card.rank] || 0) + 1
    }
    for (let r = 0; r <= 12; r++) {
      expect(rankCount[r]).toBe(4)
    }
  })
})

describe('shuffle', () => {
  it('returns array of same length', () => {
    const deck = createDeck(2)
    const shuffled = shuffle([...deck])
    expect(shuffled.length).toBe(deck.length)
  })

  it('contains the same cards (same multiset)', () => {
    const deck = createDeck(2)
    const original = [...deck].map(c => `${c.suit}-${c.rank}`).sort()
    const shuffled = shuffle([...deck]).map(c => `${c.suit}-${c.rank}`).sort()
    expect(shuffled).toEqual(original)
  })

  it('does not mutate the original array', () => {
    const deck = createDeck(2)
    const copy = [...deck]
    shuffle(deck)
    expect(deck).toEqual(copy)
  })
})

describe('draw', () => {
  it('draws N cards from the top of the deck', () => {
    const deck = createDeck(2)
    const originalLength = deck.length
    const { drawn, deck: remaining } = draw(deck, 5)
    expect(drawn.length).toBe(5)
    expect(remaining.length).toBe(originalLength - 5)
  })

  it('returns empty drawn array and unchanged deck when drawing 0', () => {
    const deck = createDeck(2)
    const { drawn, deck: remaining } = draw(deck, 0)
    expect(drawn.length).toBe(0)
    expect(remaining.length).toBe(deck.length)
  })

  it('draws all remaining cards when deck has fewer than N', () => {
    const deck = createDeck(2)
    const { drawn, deck: remaining } = draw(deck, 100)
    expect(drawn.length).toBe(52)
    expect(remaining.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @79523/engine test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement deck functions**

`packages/engine/src/deck.ts`:
```typescript
import { Card, Suit, Rank } from './types'

/**
 * Create a deck of cards. 1 deck (52 cards, no jokers) for < 4 players,
 * 2 decks (104 cards) for 4-6 players.
 */
export function createDeck(playerCount: number): Card[] {
  const deckCount = playerCount < 4 ? 1 : 2
  const cards: Card[] = []

  for (let d = 0; d < deckCount; d++) {
    for (let s = 0; s < 4; s++) {
      for (let r = 0; r < 13; r++) {
        cards.push({ suit: s as Suit, rank: r as Rank })
      }
    }
  }

  return cards
}

/**
 * Fisher-Yates shuffle. Returns a new array, does not mutate input.
 */
export function shuffle(deck: Card[]): Card[] {
  const result = [...deck]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Draw N cards from the deck. Returns drawn cards (up to N) and remaining deck.
 * Does not mutate input.
 */
export function draw(deck: Card[], n: number): { drawn: Card[]; deck: Card[] } {
  const count = Math.min(n, deck.length)
  return {
    drawn: deck.slice(0, count),
    deck: deck.slice(count),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @79523/engine test
```

Expected: ~22 tests pass (11 from types + 11 from deck).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add deck creation, shuffle, and draw"
```

---

### Task 5: Card comparison

**Files:**
- Create: `packages/engine/src/compare.ts`
- Create: `packages/engine/src/__tests__/compare.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/engine/src/__tests__/compare.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { compareCards, getSmallestCard } from '../compare'
import { Suit, Rank } from '../types'

describe('compareCards', () => {
  it('higher rank wins regardless of suit', () => {
    const card1 = { suit: Suit.Diamond, rank: Rank.Seven }
    const card2 = { suit: Suit.Spade, rank: Rank.Four }
    expect(compareCards(card1, card2)).toBeGreaterThan(0)
  })

  it('same rank: Spade beats Heart', () => {
    const card1 = { suit: Suit.Spade, rank: Rank.Ace }
    const card2 = { suit: Suit.Heart, rank: Rank.Ace }
    expect(compareCards(card1, card2)).toBeGreaterThan(0)
  })

  it('same rank: Heart beats Club', () => {
    const card1 = { suit: Suit.Heart, rank: Rank.King }
    const card2 = { suit: Suit.Club, rank: Rank.King }
    expect(compareCards(card1, card2)).toBeGreaterThan(0)
  })

  it('same rank: Club beats Diamond', () => {
    const card1 = { suit: Suit.Club, rank: Rank.Queen }
    const card2 = { suit: Suit.Diamond, rank: Rank.Queen }
    expect(compareCards(card1, card2)).toBeGreaterThan(0)
  })

  it('same rank and suit: returns 0', () => {
    const card1 = { suit: Suit.Spade, rank: Rank.Ten }
    const card2 = { suit: Suit.Spade, rank: Rank.Ten }
    expect(compareCards(card1, card2)).toBe(0)
  })

  it('Seven beats Nine', () => {
    const seven = { suit: Suit.Club, rank: Rank.Seven }
    const nine = { suit: Suit.Spade, rank: Rank.Nine }
    expect(compareCards(seven, nine)).toBeGreaterThan(0)
  })

  it('Nine beats Five', () => {
    const nine = { suit: Suit.Club, rank: Rank.Nine }
    const five = { suit: Suit.Spade, rank: Rank.Five }
    expect(compareCards(nine, five)).toBeGreaterThan(0)
  })

  it('Five beats Two', () => {
    const five = { suit: Suit.Club, rank: Rank.Five }
    const two = { suit: Suit.Spade, rank: Rank.Two }
    expect(compareCards(five, two)).toBeGreaterThan(0)
  })
})

describe('getSmallestCard', () => {
  it('returns the card with lowest rank', () => {
    const cards = [
      { suit: Suit.Spade, rank: Rank.Seven },
      { suit: Suit.Heart, rank: Rank.Four },
      { suit: Suit.Club, rank: Rank.Nine },
    ]
    const smallest = getSmallestCard(cards)
    expect(smallest.rank).toBe(Rank.Four)
  })

  it('when same rank, returns lower suit', () => {
    const cards = [
      { suit: Suit.Spade, rank: Rank.Ace },
      { suit: Suit.Diamond, rank: Rank.Ace },
    ]
    const smallest = getSmallestCard(cards)
    expect(smallest.suit).toBe(Suit.Diamond)
  })

  it('returns the only card for single-card array', () => {
    const cards = [{ suit: Suit.Heart, rank: Rank.Ten }]
    const smallest = getSmallestCard(cards)
    expect(smallest.rank).toBe(Rank.Ten)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @79523/engine test
```

Expected: FAIL.

- [ ] **Step 3: Implement compare functions**

`packages/engine/src/compare.ts`:
```typescript
import type { Card } from './types'

/**
 * Compare two cards by rank first, then by suit.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 * Lower Suit enum value = higher card (Spade=0 highest, Diamond=3 lowest).
 */
export function compareCards(a: Card, b: Card): number {
  if (a.rank !== b.rank) {
    return a.rank - b.rank
  }
  // Lower suit value = stronger
  return b.suit - a.suit
}

/**
 * Return the smallest card (lowest rank, then lowest suit) from an array.
 */
export function getSmallestCard(cards: Card[]): Card {
  return cards.reduce((min, card) =>
    compareCards(card, min) < 0 ? card : min
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @79523/engine test
```

Expected: ~33 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add card comparison functions"
```

---

### Task 6: Hand identification and judgment

**Files:**
- Create: `packages/engine/src/judge.ts`
- Create: `packages/engine/src/__tests__/judge.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/engine/src/__tests__/judge.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { identify, beats } from '../judge'
import { HandType, Suit, Rank } from '../types'
import type { Play } from '../types'

// Helper to create cards quickly
const c = (suit: Suit, rank: Rank) => ({ suit, rank })

describe('identify', () => {
  it('identifies a single card', () => {
    const cards = [c(Suit.Spade, Rank.Seven)]
    const play = identify(cards)
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Single)
  })

  it('identifies a pair', () => {
    const cards = [
      c(Suit.Spade, Rank.Seven),
      c(Suit.Heart, Rank.Seven),
    ]
    const play = identify(cards)
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Pair)
    expect(play!.primaryRank).toBe(Rank.Seven)
  })

  it('rejects two different cards as not a pair', () => {
    const cards = [
      c(Suit.Spade, Rank.Seven),
      c(Suit.Heart, Rank.Nine),
    ]
    expect(identify(cards)).toBeNull()
  })

  it('identifies a bike (pair + any single)', () => {
    const cards = [
      c(Suit.Spade, Rank.Five),
      c(Suit.Heart, Rank.Five),
      c(Suit.Club, Rank.Four),
    ]
    const play = identify(cards)
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Bike)
    expect(play!.primaryRank).toBe(Rank.Five)
  })

  it('identifies a bike where the single is the same rank (three of a kind counts as triple)', () => {
    const cards = [
      c(Suit.Spade, Rank.Five),
      c(Suit.Heart, Rank.Five),
      c(Suit.Club, Rank.Five),
    ]
    const play = identify(cards)
    // Three same = triple
    expect(play!.type).toBe(HandType.Triple)
  })

  it('identifies a triple (three of a kind)', () => {
    const cards = [
      c(Suit.Spade, Rank.Two),
      c(Suit.Heart, Rank.Two),
      c(Suit.Club, Rank.Two),
    ]
    const play = identify(cards)
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Triple)
    expect(play!.primaryRank).toBe(Rank.Two)
  })

  it('identifies a root (two pairs + any single)', () => {
    const cards = [
      c(Suit.Spade, Rank.Five),
      c(Suit.Heart, Rank.Five),
      c(Suit.Club, Rank.Three),
      c(Suit.Diamond, Rank.Three),
      c(Suit.Spade, Rank.Four),
    ]
    const play = identify(cards)
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Root)
    expect(play!.primaryRank).toBe(Rank.Five) // bigger pair
  })

  it('returns null for invalid combinations', () => {
    // 4 cards of different ranks
    expect(identify([
      c(Suit.Spade, Rank.Seven),
      c(Suit.Heart, Rank.Nine),
      c(Suit.Club, Rank.Five),
      c(Suit.Diamond, Rank.Two),
    ])).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(identify([])).toBeNull()
  })

  it('identifies a root where pairs are not adjacent in input', () => {
    const cards = [
      c(Suit.Spade, Rank.King),
      c(Suit.Heart, Rank.Ace),
      c(Suit.Diamond, Rank.King),
      c(Suit.Club, Rank.Ace),
      c(Suit.Spade, Rank.Four),
    ]
    const play = identify(cards)
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Root)
    expect(play!.primaryRank).toBe(Rank.Ace) // Ace > King
  })
})

describe('beats', () => {
  it('same type: higher rank wins', () => {
    const play1: Play = { type: HandType.Single, cards: [c(Suit.Spade, Rank.Seven)], primaryRank: Rank.Seven }
    const play2: Play = { type: HandType.Single, cards: [c(Suit.Heart, Rank.Four)], primaryRank: Rank.Four }
    expect(beats(play1, play2)).toBe(true)
  })

  it('same type and rank: higher suit wins', () => {
    const play1: Play = { type: HandType.Single, cards: [c(Suit.Spade, Rank.Ace)], primaryRank: Rank.Ace }
    const play2: Play = { type: HandType.Single, cards: [c(Suit.Diamond, Rank.Ace)], primaryRank: Rank.Ace }
    expect(beats(play1, play2)).toBe(true)
  })

  it('different types: cannot beat', () => {
    const pair: Play = { type: HandType.Pair, cards: [
      c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Four)
    ], primaryRank: Rank.Four }
    const single: Play = { type: HandType.Single, cards: [c(Suit.Spade, Rank.Seven)], primaryRank: Rank.Seven }
    expect(beats(pair, single)).toBe(false)
  })

  it('root: compares by bigger pair', () => {
    const root1: Play = {
      type: HandType.Root,
      cards: [],
      primaryRank: Rank.Five,
      secondaryRank: Rank.Three,
    }
    const root2: Play = {
      type: HandType.Root,
      cards: [],
      primaryRank: Rank.Nine,
      secondaryRank: Rank.Four,
    }
    expect(beats(root2, root1)).toBe(true)
    expect(beats(root1, root2)).toBe(false)
  })

  it('root with same primary: compares secondary pair', () => {
    const root1: Play = {
      type: HandType.Root,
      cards: [],
      primaryRank: Rank.Five,
      secondaryRank: Rank.Three,
    }
    const root2: Play = {
      type: HandType.Root,
      cards: [],
      primaryRank: Rank.Five,
      secondaryRank: Rank.Four,
    }
    expect(beats(root2, root1)).toBe(true)
  })

  it('bike: compares by the pair, not the single', () => {
    const bike1: Play = { type: HandType.Bike, cards: [], primaryRank: Rank.Five }
    const bike2: Play = { type: HandType.Bike, cards: [], primaryRank: Rank.Two }
    expect(beats(bike1, bike2)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @79523/engine test
```

Expected: FAIL.

- [ ] **Step 3: Implement judge functions**

`packages/engine/src/judge.ts`:
```typescript
import type { Card, Play } from './types'
import { HandType } from './types'
import { compareCards } from './compare'

/**
 * Identify the hand type of a set of cards.
 * Returns the Play if cards form a valid hand type, null otherwise.
 *
 * Valid types:
 * - Single: 1 card
 * - Pair: 2 cards, same rank
 * - Bike: 3 cards, exactly one pair + one different single
 * - Triple: 3 cards, all same rank
 * - Root: 5 cards, exactly two pairs + one different single
 */
export function identify(cards: Card[]): Play | null {
  if (cards.length === 0) return null

  // Group cards by rank
  const groups = new Map<number, Card[]>()
  for (const card of cards) {
    const existing = groups.get(card.rank) || []
    existing.push(card)
    groups.set(card.rank, existing)
  }

  const groupSizes = Array.from(groups.entries())
    .map(([rank, cs]) => ({ rank, count: cs.length, cards: cs }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank)

  if (cards.length === 1) {
    return {
      type: HandType.Single,
      cards: [...cards],
      primaryRank: cards[0].rank,
    }
  }

  if (cards.length === 2) {
    if (groupSizes.length === 1 && groupSizes[0].count === 2) {
      return {
        type: HandType.Pair,
        cards: [...cards],
        primaryRank: groupSizes[0].rank,
      }
    }
    return null
  }

  if (cards.length === 3) {
    // Triple: all 3 same rank
    if (groupSizes.length === 1 && groupSizes[0].count === 3) {
      return {
        type: HandType.Triple,
        cards: [...cards],
        primaryRank: groupSizes[0].rank,
      }
    }
    // Bike: one pair + one different single
    if (groupSizes.length === 2 && groupSizes[0].count === 2 && groupSizes[1].count === 1) {
      return {
        type: HandType.Bike,
        cards: [...cards],
        primaryRank: groupSizes[0].rank,
      }
    }
    return null
  }

  if (cards.length === 5) {
    // Root: two pairs + one different single
    if (
      groupSizes.length === 3 &&
      groupSizes[0].count === 2 &&
      groupSizes[1].count === 2 &&
      groupSizes[2].count === 1
    ) {
      const biggerPair = Math.max(groupSizes[0].rank, groupSizes[1].rank)
      const smallerPair = Math.min(groupSizes[0].rank, groupSizes[1].rank)
      return {
        type: HandType.Root,
        cards: [...cards],
        primaryRank: biggerPair,
        secondaryRank: smallerPair,
      }
    }
    return null
  }

  return null
}

/**
 * Check if newPlay beats currentBest.
 * Types must match. Within same type, compare primary rank, then secondary (for Root), then suit.
 */
export function beats(newPlay: Play, currentBest: Play): boolean {
  if (newPlay.type !== currentBest.type) {
    return false
  }

  if (newPlay.primaryRank !== currentBest.primaryRank) {
    return newPlay.primaryRank > currentBest.primaryRank
  }

  // Same primary rank
  if (newPlay.type === HandType.Root && newPlay.secondaryRank !== undefined && currentBest.secondaryRank !== undefined) {
    if (newPlay.secondaryRank !== currentBest.secondaryRank) {
      return newPlay.secondaryRank > currentBest.secondaryRank
    }
  }

  // Same rank(s), compare by highest card suit
  const newHighest = [...newPlay.cards].sort((a, b) => compareCards(b, a))[0]
  const bestHighest = [...currentBest.cards].sort((a, b) => compareCards(b, a))[0]
  return compareCards(newHighest, bestHighest) > 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @79523/engine test
```

Expected: ~49 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add hand identification and judgment"
```

---

### Task 7: Score calculation

**Files:**
- Create: `packages/engine/src/score.ts`
- Create: `packages/engine/src/__tests__/score.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/engine/src/__tests__/score.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { calculateScore, isScoreCard, getScoreCards, needsBoxer } from '../score'
import { Suit, Rank } from '../types'

describe('isScoreCard', () => {
  it('5 is a score card', () => {
    expect(isScoreCard({ suit: Suit.Spade, rank: Rank.Five })).toBe(true)
  })

  it('10 is a score card', () => {
    expect(isScoreCard({ suit: Suit.Heart, rank: Rank.Ten })).toBe(true)
  })

  it('K is a score card', () => {
    expect(isScoreCard({ suit: Suit.Club, rank: Rank.King })).toBe(true)
  })

  it('7 is not a score card', () => {
    expect(isScoreCard({ suit: Suit.Spade, rank: Rank.Seven })).toBe(false)
  })

  it('A is not a score card', () => {
    expect(isScoreCard({ suit: Suit.Diamond, rank: Rank.Ace })).toBe(false)
  })
})

describe('calculateScore', () => {
  it('5 = 5 points, 10 = 10 points, K = 10 points', () => {
    const cards = [
      { suit: Suit.Spade, rank: Rank.Five },
      { suit: Suit.Heart, rank: Rank.Ten },
      { suit: Suit.Club, rank: Rank.King },
    ]
    expect(calculateScore(cards)).toBe(25)
  })

  it('non-score cards contribute 0', () => {
    const cards = [
      { suit: Suit.Spade, rank: Rank.Seven },
      { suit: Suit.Heart, rank: Rank.Nine },
    ]
    expect(calculateScore(cards)).toBe(0)
  })

  it('empty array returns 0', () => {
    expect(calculateScore([])).toBe(0)
  })
})

describe('getScoreCards', () => {
  it('filters only score cards from mixed cards', () => {
    const cards = [
      { suit: Suit.Spade, rank: Rank.Five },
      { suit: Suit.Heart, rank: Rank.Seven },
      { suit: Suit.Club, rank: Rank.King },
      { suit: Suit.Diamond, rank: Rank.Four },
    ]
    const scores = getScoreCards(cards)
    expect(scores.length).toBe(2)
  })
})

describe('needsBoxer', () => {
  it('returns score cards that need boxing', () => {
    const cards = [
      { suit: Suit.Spade, rank: Rank.Five },
      { suit: Suit.Heart, rank: Rank.Ten },
      { suit: Suit.Club, rank: Rank.Seven },
    ]
    const result = needsBoxer(cards)
    expect(result.length).toBe(2)
    expect(result.every(c => isScoreCard(c))).toBe(true)
  })

  it('returns empty when no score cards', () => {
    const cards = [
      { suit: Suit.Spade, rank: Rank.Seven },
      { suit: Suit.Heart, rank: Rank.Nine },
    ]
    expect(needsBoxer(cards).length).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @79523/engine test
```

Expected: FAIL.

- [ ] **Step 3: Implement score functions**

`packages/engine/src/score.ts`:
```typescript
import type { Card } from './types'
import { Rank } from './types'

/**
 * Check if a card is a score card (5, 10, or K).
 */
export function isScoreCard(card: Card): boolean {
  return card.rank === Rank.Five || card.rank === Rank.Ten || card.rank === Rank.King
}

/**
 * Calculate score from a set of cards.
 * 5 = 5 points, 10 = 10 points, K = 10 points.
 */
export function calculateScore(cards: Card[]): number {
  return cards.reduce((sum, card) => {
    if (card.rank === Rank.Five) return sum + 5
    if (card.rank === Rank.Ten || card.rank === Rank.King) return sum + 10
    return sum
  }, 0)
}

/**
 * Filter only score cards from an array.
 */
export function getScoreCards(cards: Card[]): Card[] {
  return cards.filter(isScoreCard)
}

/**
 * Get the score cards from a set of cards that need boxing.
 * (Score cards still in players' hands when game ends.)
 */
export function needsBoxer(cards: Card[]): Card[] {
  return getScoreCards(cards)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @79523/engine test
```

Expected: ~58 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add score calculation"
```

---

### Task 8: Boxer king logic

**Files:**
- Create: `packages/engine/src/boxer.ts`
- Create: `packages/engine/src/__tests__/boxer.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/engine/src/__tests__/boxer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { resolveRound, getWinner } from '../boxer'
import { BoxerMove } from '../types'

describe('resolveRound', () => {
  it('rock beats scissors', () => {
    const survivors = resolveRound(new Map([
      ['p1', BoxerMove.Rock],
      ['p2', BoxerMove.Scissors],
    ]))
    expect(survivors).toEqual(['p1'])
  })

  it('scissors beats paper', () => {
    const survivors = resolveRound(new Map([
      ['p1', BoxerMove.Scissors],
      ['p2', BoxerMove.Paper],
    ]))
    expect(survivors).toEqual(['p1'])
  })

  it('paper beats rock', () => {
    const survivors = resolveRound(new Map([
      ['p1', BoxerMove.Paper],
      ['p2', BoxerMove.Rock],
    ]))
    expect(survivors).toEqual(['p1'])
  })

  it('same move: both survive', () => {
    const survivors = resolveRound(new Map([
      ['p1', BoxerMove.Rock],
      ['p2', BoxerMove.Rock],
    ]))
    expect(survivors).toEqual(['p1', 'p2'])
  })

  it('three players: only the winning move survives', () => {
    const survivors = resolveRound(new Map([
      ['p1', BoxerMove.Rock],
      ['p2', BoxerMove.Scissors],
      ['p3', BoxerMove.Rock],
    ]))
    expect(survivors.sort()).toEqual(['p1', 'p3'].sort())
  })

  it('all three moves present: no one wins (tie)', () => {
    const survivors = resolveRound(new Map([
      ['p1', BoxerMove.Rock],
      ['p2', BoxerMove.Paper],
      ['p3', BoxerMove.Scissors],
    ]))
    expect(survivors.sort()).toEqual(['p1', 'p2', 'p3'].sort())
  })

  it('single player: auto survives', () => {
    const survivors = resolveRound(new Map([
      ['p1', BoxerMove.Rock],
    ]))
    expect(survivors).toEqual(['p1'])
  })
})

describe('getWinner', () => {
  it('returns the only survivor', () => {
    expect(getWinner(['p1'])).toBe('p1')
  })

  it('throws on multiple survivors', () => {
    expect(() => getWinner(['p1', 'p2'])).toThrow()
  })

  it('throws on empty array', () => {
    expect(() => getWinner([])).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @79523/engine test
```

Expected: FAIL.

- [ ] **Step 3: Implement boxer functions**

`packages/engine/src/boxer.ts`:
```typescript
import { BoxerMove } from './types'

const BEATS: Record<BoxerMove, BoxerMove> = {
  [BoxerMove.Rock]: BoxerMove.Scissors,
  [BoxerMove.Scissors]: BoxerMove.Paper,
  [BoxerMove.Paper]: BoxerMove.Rock,
}

/**
 * Resolve one round of boxer king.
 * Returns IDs of players who survive this round.
 * If all three moves are present, everyone survives (no elimination).
 * If only one or two moves present, the winning move's players survive.
 */
export function resolveRound(moves: Map<string, BoxerMove>): string[] {
  const entries = Array.from(moves.entries())
  if (entries.length <= 1) return entries.map(([id]) => id)

  const uniqueMoves = new Set(entries.map(([, m]) => m))

  // All three moves present = no elimination
  if (uniqueMoves.size === 3) return entries.map(([id]) => id)

  // Only one move = everyone ties, all survive
  if (uniqueMoves.size === 1) return entries.map(([id]) => id)

  // Two moves: find which beats which
  const moveList = Array.from(uniqueMoves)
  const winningMove = BEATS[moveList[0]] === moveList[1] ? moveList[0] : moveList[1]

  return entries.filter(([, m]) => m === winningMove).map(([id]) => id)
}

/**
 * Assert there's exactly one survivor and return the winner ID.
 */
export function getWinner(survivors: string[]): string {
  if (survivors.length !== 1) {
    throw new Error(`Expected exactly 1 survivor, got ${survivors.length}`)
  }
  return survivors[0]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @79523/engine test
```

Expected: ~66 tests pass.

- [ ] **Step 5: Create engine index**

`packages/engine/src/index.ts`:
```typescript
export * from './types'
export * from './deck'
export * from './compare'
export * from './judge'
export * from './score'
export * from './boxer'
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): add boxer king logic and engine index"
```

---

### Task 9: Engine additional edge case tests

**Files:**
- Modify: `packages/engine/src/__tests__/judge.test.ts`
- Modify: `packages/engine/src/__tests__/compare.test.ts`

- [ ] **Step 1: Add edge case tests for identify**

Append to `packages/engine/src/__tests__/judge.test.ts`:
```typescript
describe('identify edge cases', () => {
  it('rejects 4 cards (no valid 4-card hand type)', () => {
    const cards = [
      c(Suit.Spade, Rank.Seven),
      c(Suit.Heart, Rank.Seven),
      c(Suit.Club, Rank.Five),
      c(Suit.Diamond, Rank.Five),
    ]
    expect(identify(cards)).toBeNull()
  })

  it('rejects 6 cards (no valid 6-card hand type)', () => {
    const cards = [
      c(Suit.Spade, Rank.Seven),
      c(Suit.Heart, Rank.Seven),
      c(Suit.Club, Rank.Five),
      c(Suit.Diamond, Rank.Five),
      c(Suit.Spade, Rank.Three),
      c(Suit.Heart, Rank.Three),
    ]
    expect(identify(cards)).toBeNull()
  })

  it('root with full house (3+2) is NOT a valid root', () => {
    const cards = [
      c(Suit.Spade, Rank.Five),
      c(Suit.Heart, Rank.Five),
      c(Suit.Club, Rank.Five),
      c(Suit.Diamond, Rank.King),
      c(Suit.Spade, Rank.King),
    ]
    expect(identify(cards)).toBeNull()
  })

  it('correctly identifies all 5 supported hand types', () => {
    const single = identify([c(Suit.Spade, Rank.Seven)])
    const pair = identify([c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five)])
    const bike = identify([c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.Four)])
    const triple = identify([c(Suit.Spade, Rank.Two), c(Suit.Heart, Rank.Two), c(Suit.Club, Rank.Two)])
    const root = identify([
      c(Suit.Spade, Rank.Ace), c(Suit.Heart, Rank.Ace),
      c(Suit.Club, Rank.King), c(Suit.Diamond, Rank.King),
      c(Suit.Spade, Rank.Four),
    ])

    expect(single!.type).toBe('single')
    expect(pair!.type).toBe('pair')
    expect(bike!.type).toBe('bike')
    expect(triple!.type).toBe('triple')
    expect(root!.type).toBe('root')
  })
})
```

- [ ] **Step 2: Add edge case tests for compareCards**

Append to `packages/engine/src/__tests__/compare.test.ts`:
```typescript
describe('full card order verification', () => {
  it('verifies the complete card order in ascending power', () => {
    const ascending = [
      Rank.Four, Rank.Six, Rank.Eight, Rank.Ten, Rank.Jack,
      Rank.Queen, Rank.King, Rank.Ace, Rank.Three, Rank.Two,
      Rank.Five, Rank.Nine, Rank.Seven,
    ]
    for (let i = 0; i < ascending.length - 1; i++) {
      const lower = { suit: Suit.Spade, rank: ascending[i] }
      const higher = { suit: Suit.Diamond, rank: ascending[i + 1] }
      expect(compareCards(higher, lower)).toBeGreaterThan(0)
    }
  })
})

describe('suit order verification', () => {
  it('Spade > Heart > Club > Diamond for same rank', () => {
    const suits = [Suit.Spade, Suit.Heart, Suit.Club, Suit.Diamond]
    for (let i = 0; i < suits.length - 1; i++) {
      const higher = { suit: suits[i], rank: Rank.Ace }
      const lower = { suit: suits[i + 1], rank: Rank.Ace }
      expect(compareCards(higher, lower)).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 3: Run all engine tests**

```bash
pnpm --filter @79523/engine test
```

Expected: ~75 tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(engine): add edge case tests for judge and compare"
```

---

## Phase 3: Server Package

### Task 10: Server package scaffold

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/jest.config.js`

- [ ] **Step 1: Create server package.json**

```json
{
  "name": "@79523/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --forceExit"
  },
  "dependencies": {
    "@79523/engine": "workspace:*",
    "express": "^4.19.0",
    "socket.io": "^4.7.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.12.0",
    "jest": "^29.7.0",
    "@jest/globals": "^29.7.0",
    "ts-jest": "^29.1.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "socket.io-client": "^4.7.0"
  }
}
```

- [ ] **Step 2: Create server tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create jest.config.js**

```javascript
/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd /home/michael/Documents/repository/agent_harness/79523
pnpm install
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold server package"
```

---

### Task 11: Server types

**Files:**
- Create: `packages/server/src/types.ts`

- [ ] **Step 1: Write server-specific types**

`packages/server/src/types.ts`:
```typescript
import type { Card, GamePhase, BoxerMove } from '@79523/engine'

export interface Player {
  id: string
  name: string
  socketId: string
  ready: boolean
  connected: boolean
}

export interface Room {
  code: string
  maxPlayers: number
  players: Player[]
  createdAt: number
  game: ServerGame | null
}

export interface ServerGame {
  phase: GamePhase
  deck: Card[]
  players: GamePlayer[]
  currentPlayerIndex: number
  currentBestPlay: {
    type: string
    cards: Card[]
    primaryRank: number
  } | null
  bestPlayerId: string | null
  passCount: number
  tableCards: Card[]
  gameOver: boolean
  roundParticipants: Set<string>
}

export interface GamePlayer {
  id: string
  hand: Card[]
  score: number
  totalScore: number
  finished: boolean
  hasBoxerBadge: boolean
}

// Socket event types
export interface ServerEvents {
  room_created: (data: { roomCode: string }) => void
  player_joined: (data: { players: Player[] }) => void
  player_left: (data: { playerId: string; players: Player[] }) => void
  game_started: (data: { hand: Card[]; players: GamePlayer[]; leadPlayerId: string }) => void
  your_turn: (data: { timeout: number }) => void
  play_made: (data: { playerId: string; play: { type: string; cards: Card[] }; tableCards: Card[] }) => void
  round_result: (data: { winnerId: string; scoreCards: Card[]; scores: { id: string; score: number }[] }) => void
  draw_card: (data: { cards: Card[] }) => void
  game_over: (data: { scores: { id: string; totalScore: number }[]; remainingScoreCards: Card[] }) => void
  boxer_start: (data: { scoreCard: Card; participants: string[] }) => void
  boxer_reveal: (data: { moves: Record<string, string> }) => void
  boxer_eliminated: (data: { playerId: string }) => void
  boxer_winner: (data: { playerId: string; scoreCard: Card }) => void
  surrender_swap: (data: { losers: { id: string; gaveUpCard: Card; receivedCard: Card }[] }) => void
  next_game_lead: (data: { playerId: string }) => void
  player_disconnected: (data: { playerId: string }) => void
  player_reconnected: (data: { playerId: string }) => void
  error: (data: { message: string }) => void
  full_state: (data: ServerGame & { myHand: Card[]; myId: string }) => void
}

export interface ClientEvents {
  create_room: (data: { name: string; maxPlayers: number }) => void
  join_room: (data: { roomCode: string; playerName: string }) => void
  ready: () => void
  play: (data: { cards: Card[] }) => void
  pass: () => void
  boxer_move: (data: { move: BoxerMove }) => void
  leave_room: () => void
  reconnect: (data: { roomCode: string; playerId: string }) => void
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(server): add server type definitions"
```

---

### Task 12: Server utilities, room manager, and player manager

**Files:**
- Create: `packages/server/src/utils.ts`
- Create: `packages/server/src/player.ts`
- Create: `packages/server/src/room.ts`

- [ ] **Step 1: Create utils.ts**

`packages/server/src/utils.ts`:
```typescript
/**
 * Generate a 6-character room code.
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * Create a promise that resolves after ms milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

- [ ] **Step 2: Create player.ts**

`packages/server/src/player.ts`:
```typescript
import type { Player } from './types'

const players = new Map<string, Player>()

export function createPlayer(socketId: string, name: string): Player {
  const player: Player = {
    id: socketId.slice(0, 8) + Date.now().toString(36),
    name,
    socketId,
    ready: false,
    connected: true,
  }
  players.set(player.id, player)
  return player
}

export function getPlayer(id: string): Player | undefined {
  return players.get(id)
}

export function removePlayer(id: string): void {
  players.delete(id)
}

export function setPlayerReady(id: string, ready: boolean): void {
  const player = players.get(id)
  if (player) player.ready = ready
}

export function setPlayerConnected(id: string, connected: boolean): void {
  const player = players.get(id)
  if (player) player.connected = connected
}

export function resetPlayerReady(id: string): void {
  const player = players.get(id)
  if (player) player.ready = false
}
```

- [ ] **Step 3: Create room.ts**

`packages/server/src/room.ts`:
```typescript
import type { Room, Player } from './types'
import { generateRoomCode } from './utils'
import { getPlayer, removePlayer } from './player'

const rooms = new Map<string, Room>()

export function createRoom(maxPlayers: number): Room {
  let code: string
  do {
    code = generateRoomCode()
  } while (rooms.has(code))

  const room: Room = {
    code,
    maxPlayers,
    players: [],
    createdAt: Date.now(),
    game: null,
  }
  rooms.set(code, room)
  return room
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code)
}

export function getAllRooms(): Room[] {
  return Array.from(rooms.values())
}

export function joinRoom(code: string, player: Player): Room | null {
  const room = rooms.get(code)
  if (!room) return null
  if (room.players.length >= room.maxPlayers) return null
  if (room.players.some(p => p.id === player.id)) return room
  room.players.push(player)
  return room
}

export function leaveRoom(code: string, playerId: string): Room | null {
  const room = rooms.get(code)
  if (!room) return null
  room.players = room.players.filter(p => p.id !== playerId)
  removePlayer(playerId)
  if (room.players.length === 0) {
    rooms.delete(code)
    return null
  }
  return room
}

export function destroyRoom(code: string): void {
  rooms.delete(code)
}

export function setRoomGame(code: string, game: Room['game']): void {
  const room = rooms.get(code)
  if (room) room.game = game
}

export function cleanupStaleRooms(): void {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (room.players.length === 0 && now - room.createdAt > 10 * 60 * 1000) {
      rooms.delete(code)
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(server): add room and player managers"
```

---

### Task 13: Game machine

**Files:**
- Create: `packages/server/src/game-machine.ts`

- [ ] **Step 1: Create game-machine.ts**

`packages/server/src/game-machine.ts`:
```typescript
import { createDeck, shuffle, draw, identify, beats, calculateScore, needsBoxer, GamePhase, compareCards, getSmallestCard } from '@79523/engine'
import type { Card } from '@79523/engine'
import type { ServerGame, GamePlayer } from './types'

export function initGame(playerIds: string[]): ServerGame {
  const deck = shuffle(createDeck(playerIds.length))
  const players: GamePlayer[] = playerIds.map(id => ({
    id,
    hand: [],
    score: 0,
    totalScore: 0,
    finished: false,
    hasBoxerBadge: false,
  }))

  for (const player of players) {
    const { drawn, deck: remaining } = draw(deck, 5)
    player.hand = drawn
    deck.length = 0
    deck.push(...remaining)
  }

  return {
    phase: GamePhase.Playing,
    deck: structuredClone(deck.map(c => ({ ...c }))),
    players,
    currentPlayerIndex: 0,
    currentBestPlay: null,
    bestPlayerId: null,
    passCount: 0,
    tableCards: [],
    gameOver: false,
    roundParticipants: new Set(),
  }
}

export function findLeadPlayer(game: ServerGame): string {
  let smallestCard: Card | null = null
  let smallestPlayerId = ''

  for (const player of game.players) {
    const minCard = getSmallestCard(player.hand)
    if (!smallestCard || compareCards(minCard, smallestCard) < 0) {
      smallestCard = minCard
      smallestPlayerId = player.id
    }
  }

  return smallestPlayerId
}

export function getNextPlayerIndex(game: ServerGame): number {
  let next = (game.currentPlayerIndex + 1) % game.players.length
  while (game.players[next].finished) {
    next = (next + 1) % game.players.length
  }
  return next
}

export function handlePlay(
  game: ServerGame,
  playerId: string,
  playerCards: Card[],
): { success: boolean; error?: string; roundWinner?: string; gameOver?: boolean } {
  const player = game.players.find(p => p.id === playerId)
  if (!player) return { success: false, error: 'Player not found' }

  const play = identify(playerCards)
  if (!play) return { success: false, error: 'Invalid card combination' }

  if (game.currentBestPlay) {
    if (!beats(play, game.currentBestPlay)) {
      return { success: false, error: 'Cards do not beat the current play' }
    }
  }

  player.hand = player.hand.filter(c => !playerCards.some(pc => pc.suit === c.suit && pc.rank === c.rank))

  if (player.hand.length === 0) {
    player.finished = true
  }

  game.tableCards.push(...playerCards)
  game.currentBestPlay = { type: play.type, cards: playerCards, primaryRank: play.primaryRank }
  game.bestPlayerId = playerId
  game.roundParticipants.add(playerId)

  const activePlayers = game.players.filter(p => !p.finished).length
  if (game.passCount >= activePlayers - 1) {
    if (game.bestPlayerId) {
      const winner = game.players.find(p => p.id === game.bestPlayerId)!
      const scoreCards = game.tableCards.filter(c => {
        const { Rank } = require('@79523/engine')
        return c.rank === Rank.Five || c.rank === Rank.Ten || c.rank === Rank.King
      })
      winner.score += calculateScore(scoreCards)
    }

    game.currentBestPlay = null
    game.bestPlayerId = null
    game.passCount = 0
    game.tableCards = []

    const someoneFinished = game.players.some(p => p.finished)
    if (game.deck.length === 0 && someoneFinished) {
      game.gameOver = true
      game.phase = GamePhase.Settling
      return { success: true, roundWinner: game.bestPlayerId, gameOver: true }
    }

    for (const pid of game.roundParticipants) {
      const p = game.players.find(pl => pl.id === pid)
      if (p && !p.finished && p.hand.length < 5) {
        const toDraw = 5 - p.hand.length
        const { drawn, deck: remaining } = draw(game.deck, toDraw)
        p.hand.push(...drawn)
        game.deck = remaining
      }
    }
    game.roundParticipants.clear()

    return { success: true, roundWinner: game.bestPlayerId }
  }

  return { success: true }
}

export function handlePass(game: ServerGame, playerId: string): { success: boolean; error?: string; roundOver?: boolean; roundWinner?: string } {
  game.passCount++
  const activePlayers = game.players.filter(p => !p.finished).length

  if (game.passCount >= activePlayers - 1 && game.bestPlayerId) {
    const winner = game.players.find(p => p.id === game.bestPlayerId)!
    const score = calculateScore(game.tableCards)
    winner.score += score

    game.currentBestPlay = null
    game.bestPlayerId = null
    game.passCount = 0
    game.tableCards = []

    for (const pid of game.roundParticipants) {
      const p = game.players.find(pl => pl.id === pid)
      if (p && !p.finished && p.hand.length < 5) {
        const toDraw = 5 - p.hand.length
        const { drawn, deck: remaining } = draw(game.deck, toDraw)
        p.hand.push(...drawn)
        game.deck = remaining
      }
    }
    game.roundParticipants.clear()

    const someoneFinished = game.players.some(p => p.finished)
    if (game.deck.length === 0 && someoneFinished) {
      game.gameOver = true
      game.phase = GamePhase.Settling
      return { success: true, roundOver: true, roundWinner: winner.id }
    }

    return { success: true, roundOver: true, roundWinner: winner.id }
  }

  return { success: true }
}

export function settleGame(game: ServerGame): {
  scores: { id: string; totalScore: number }[]
  topTwo: string[]
  bottomTwo: string[]
} {
  const sorted = [...game.players].sort((a, b) => b.score - a.score)

  return {
    scores: sorted.map(p => ({ id: p.id, totalScore: p.score })),
    topTwo: sorted.slice(0, 2).map(p => p.id),
    bottomTwo: sorted.slice(-2).map(p => p.id),
  }
}

export function getLargestSingle(hand: Card[]): Card {
  return hand.reduce((max, card) => compareCards(card, max) > 0 ? card : max)
}

export function getSmallestSingle(hand: Card[]): Card {
  return getSmallestCard(hand)
}

export function removeCardFromHand(hand: Card[], card: Card): Card[] {
  const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank)
  if (idx >= 0) {
    return [...hand.slice(0, idx), ...hand.slice(idx + 1)]
  }
  return hand
}

export function determineNextLead(surrenderedCards: { playerId: string; card: Card }[]): string {
  return surrenderedCards.reduce((best, curr) =>
    compareCards(curr.card, best.card) > 0 ? curr : best
  ).playerId
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(server): add game machine with full game flow"
```

---

### Task 14: API routes and WebSocket handler

**Files:**
- Create: `packages/server/src/api.ts`
- Create: `packages/server/src/ws.ts`

- [ ] **Step 1: Create api.ts**

`packages/server/src/api.ts`:
```typescript
import { Router } from 'express'
import { createRoom, getAllRooms } from './room'

const router = Router()

router.get('/rooms', (_req, res) => {
  const rooms = getAllRooms().map(r => ({
    code: r.code,
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    inGame: r.game !== null,
  }))
  res.json(rooms)
})

router.post('/rooms', (req, res) => {
  const { maxPlayers } = req.body
  const count = Math.min(Math.max(maxPlayers || 4, 2), 6)
  const room = createRoom(count)
  res.json({ roomCode: room.code, maxPlayers: room.maxPlayers })
})

export default router
```

- [ ] **Step 2: Create ws.ts**

`packages/server/src/ws.ts`:
```typescript
import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import type { ClientEvents, ServerEvents } from './types'
import { createPlayer, getPlayer, setPlayerReady, setPlayerConnected, resetPlayerReady } from './player'
import { createRoom, getRoom, joinRoom, leaveRoom } from './room'
import { initGame, handlePlay, handlePass, findLeadPlayer, settleGame, getLargestSingle, removeCardFromHand, determineNextLead } from './game-machine'
import { calculateScore, needsBoxer, resolveRound, getWinner, BoxerMove, GamePhase, compareCards, Rank } from '@79523/engine'
import type { Card } from '@79523/engine'

export function setupWebSocket(server: HttpServer) {
  const io = new Server<ClientEvents, ServerEvents>(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  })

  io.on('connection', (socket) => {
    let currentPlayerId: string | null = null
    let currentRoomCode: string | null = null

    socket.on('create_room', ({ name, maxPlayers }) => {
      const room = createRoom(maxPlayers)
      const player = createPlayer(socket.id, name)
      joinRoom(room.code, player)
      currentPlayerId = player.id
      currentRoomCode = room.code
      socket.join(room.code)
      socket.emit('room_created', { roomCode: room.code })
    })

    socket.on('join_room', ({ roomCode, playerName }) => {
      const player = createPlayer(socket.id, playerName)
      const room = joinRoom(roomCode, player)
      if (!room) {
        socket.emit('error', { message: 'Room not found or full' })
        return
      }
      currentPlayerId = player.id
      currentRoomCode = roomCode
      socket.join(roomCode)
      io.to(roomCode).emit('player_joined', { players: room.players.map(p => ({ ...p, socketId: '' })) })
    })

    socket.on('ready', () => {
      if (!currentPlayerId || !currentRoomCode) return
      setPlayerReady(currentPlayerId, true)
      const room = getRoom(currentRoomCode)
      if (!room) return

      const allReady = room.players.every(p => p.ready)
      if (allReady && room.players.length >= 2) {
        const playerIds = room.players.map(p => p.id)
        const game = initGame(playerIds)
        room.game = game

        const leadPlayerId = findLeadPlayer(game)
        game.currentPlayerIndex = game.players.findIndex(p => p.id === leadPlayerId)

        for (const player of room.players) {
          const gp = game.players.find(p => p.id === player.id)!
          io.to(player.socketId).emit('game_started', {
            hand: gp.hand,
            players: game.players.map(p => ({ ...p, hand: [] })),
            leadPlayerId,
          })
        }

        const leadSocket = room.players.find(p => p.id === leadPlayerId)!
        io.to(leadSocket.socketId).emit('your_turn', { timeout: 30 })
      }
    })

    socket.on('play', ({ cards }) => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.game) return

      const game = room.game
      const currentPlayer = game.players[game.currentPlayerIndex]
      if (currentPlayer.id !== currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' })
        return
      }

      const result = handlePlay(game, currentPlayerId, cards)
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Invalid play' })
        return
      }

      io.to(currentRoomCode).emit('play_made', {
        playerId: currentPlayerId,
        play: { type: 'play', cards },
        tableCards: game.tableCards,
      })

      if (result.roundWinner) {
        const winner = game.players.find(p => p.id === result.roundWinner)!
        const scoreCards = game.tableCards.filter(c => {
          const { Rank: Rk } = require('@79523/engine')
          return c.rank === Rk.Five || c.rank === Rk.Ten || c.rank === Rk.King
        })
        const roundScore = calculateScore(scoreCards)

        io.to(currentRoomCode).emit('round_result', {
          winnerId: result.roundWinner,
          scoreCards,
          scores: game.players.map(p => ({ id: p.id, score: p.score })),
        })

        if (result.gameOver) {
          const settlement = settleGame(game)
          io.to(currentRoomCode).emit('game_over', {
            scores: settlement.scores,
            remainingScoreCards: [],
          })
          return
        }

        for (const pid of game.roundParticipants) {
          const p = game.players.find(pl => pl.id === pid)!
          const socket_ = room.players.find(rp => rp.id === pid)
          if (socket_) {
            io.to(socket_.socketId).emit('draw_card', { cards: p.hand.slice(-1) })
          }
        }
      }

      if (!game.gameOver) {
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
        while (game.players[game.currentPlayerIndex].finished) {
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
        }
        const nextPlayer = room.players[game.currentPlayerIndex]
        io.to(nextPlayer.socketId).emit('your_turn', { timeout: 30 })
      }
    })

    socket.on('pass', () => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.game) return

      const game = room.game
      const currentPlayer = game.players[game.currentPlayerIndex]
      if (currentPlayer.id !== currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' })
        return
      }

      const result = handlePass(game, currentPlayerId)
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Invalid pass' })
        return
      }

      if (result.roundOver && result.roundWinner) {
        io.to(currentRoomCode).emit('round_result', {
          winnerId: result.roundWinner,
          scoreCards: [],
          scores: game.players.map(p => ({ id: p.id, score: p.score })),
        })
      }

      if (!game.gameOver) {
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
        const nextPlayer = room.players[game.currentPlayerIndex]
        io.to(nextPlayer.socketId).emit('your_turn', { timeout: 30 })
      }
    })

    socket.on('boxer_move', ({ move }) => {
      socket.emit('error', { message: 'Boxer king coming soon' })
    })

    socket.on('disconnect', () => {
      if (currentPlayerId && currentRoomCode) {
        setPlayerConnected(currentPlayerId, false)
        io.to(currentRoomCode).emit('player_disconnected', { playerId: currentPlayerId })
        setTimeout(() => {
          const player = getPlayer(currentPlayerId!)
          if (player && !player.connected) {
            leaveRoom(currentRoomCode!, currentPlayerId!)
            io.to(currentRoomCode!).emit('player_left', {
              playerId: currentPlayerId!,
              players: [],
            })
          }
        }, 30000)
      }
    })

    socket.on('reconnect', ({ roomCode, playerId }) => {
      const player = getPlayer(playerId)
      if (!player) {
        socket.emit('error', { message: 'Player not found' })
        return
      }
      setPlayerConnected(playerId, true)
      socket.join(roomCode)
      currentPlayerId = playerId
      currentRoomCode = roomCode
      io.to(roomCode).emit('player_reconnected', { playerId })

      const room = getRoom(roomCode)
      if (room?.game) {
        const game = room.game
        const gp = game.players.find(p => p.id === playerId)!
        socket.emit('full_state', { ...game, myHand: gp.hand, myId: playerId })
      }
    })
  })

  return io
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(server): add API routes and WebSocket handler"
```

---

### Task 15: Server entry point

**Files:**
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: Create index.ts**

`packages/server/src/index.ts`:
```typescript
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import apiRoutes from './api'
import { setupWebSocket } from './ws'

const app = express()
const httpServer = createServer(app)

app.use(cors())
app.use(express.json())
app.use('/api', apiRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

setupWebSocket(httpServer)

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(server): add server entry point"
```

---

### Task 16: Server integration test

**Files:**
- Create: `packages/server/src/__tests__/room.test.ts`

- [ ] **Step 1: Write room test**

`packages/server/src/__tests__/room.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from '@jest/globals'
import { createRoom, getRoom, joinRoom, leaveRoom } from '../room'
import { createPlayer } from '../player'

describe('Room management', () => {
  beforeEach(() => {
    // Module-level maps persist; each test creates fresh rooms
  })

  it('creates a room with a 6-character code', () => {
    const room = createRoom(4)
    expect(room.code.length).toBe(6)
    expect(room.maxPlayers).toBe(4)
  })

  it('allows joining a room', () => {
    const room = createRoom(4)
    const player = createPlayer('socket1', 'Alice')
    const joined = joinRoom(room.code, player)
    expect(joined).not.toBeNull()
    expect(joined!.players.length).toBe(1)
  })

  it('rejects joining a full room', () => {
    const room = createRoom(2)
    joinRoom(room.code, createPlayer('s1', 'Alice'))
    joinRoom(room.code, createPlayer('s2', 'Bob'))
    const result = joinRoom(room.code, createPlayer('s3', 'Charlie'))
    expect(result).toBeNull()
  })

  it('allows leaving a room', () => {
    const room = createRoom(4)
    const player = createPlayer('s1', 'Alice')
    joinRoom(room.code, player)
    const updated = leaveRoom(room.code, player.id)
    expect(updated).not.toBeNull()
    expect(updated!.players.length).toBe(0)
  })

  it('destroys empty rooms', () => {
    const room = createRoom(4)
    const player = createPlayer('s1', 'Alice')
    joinRoom(room.code, player)
    leaveRoom(room.code, player.id)
    expect(getRoom(room.code)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run server tests**

```bash
pnpm --filter @79523/server test
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(server): add room management tests"
```

---

## Phase 4: Client Package

### Task 17: Client package scaffold

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.ts`
- Create: `packages/client/src/App.vue`
- Create: `packages/client/env.d.ts`

- [ ] **Step 1: Create client package.json**

```json
{
  "name": "@79523/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@79523/engine": "workspace:*",
    "vue": "^3.4.0",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.0",
    "socket.io-client": "^4.7.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "vue-tsc": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create client tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "preserve",
    "jsxImportSource": "vue",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "env.d.ts"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <title>79523</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #app { height: 100%; overflow: hidden; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Create main.ts**

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

- [ ] **Step 6: Create App.vue**

```vue
<template>
  <router-view />
</template>

<script setup lang="ts">
</script>
```

- [ ] **Step 7: Create env.d.ts**

```typescript
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
```

- [ ] **Step 8: Install and verify**

```bash
cd /home/michael/Documents/repository/agent_harness/79523
pnpm install
pnpm --filter @79523/client dev &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```

Expected: HTML content returned.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold client package with Vue 3 + Vite"
```

---

### Task 18: Router and views (skeleton)

**Files:**
- Create: `packages/client/src/router/index.ts`
- Create: `packages/client/src/views/HomeView.vue`
- Create: `packages/client/src/views/RoomView.vue`
- Create: `packages/client/src/views/GameView.vue`
- Create: `packages/client/src/types/index.ts`

- [ ] **Step 1: Create types/index.ts**

```typescript
export type { Card, Suit, Rank, HandType, Play, BoxerMove, GamePhase } from '@79523/engine'

export interface PlayerInfo {
  id: string
  name: string
  ready: boolean
  connected: boolean
}

export interface UIGameState {
  myHand: Card[]
  tableCards: Card[]
  players: PlayerInfo[]
  currentTurn: string
  scores: Record<string, number>
  deckCount: number
  phase: string
  timeLeft: number
}
```

- [ ] **Step 2: Create router**

`packages/client/src/router/index.ts`:
```typescript
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/room/:code', name: 'room', component: () => import('@/views/RoomView.vue') },
    { path: '/game/:code', name: 'game', component: () => import('@/views/GameView.vue') },
  ],
})

export default router
```

- [ ] **Step 3: Create HomeView.vue**

```vue
<template>
  <div class="home">
    <h1>79523</h1>
    <CreateRoom />
    <JoinRoom />
  </div>
</template>

<script setup lang="ts">
import CreateRoom from '@/components/room/CreateRoom.vue'
import JoinRoom from '@/components/room/JoinRoom.vue'
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 2rem;
  padding: 2rem;
}
h1 {
  font-size: 3rem;
}
</style>
```

- [ ] **Step 4: Create RoomView.vue (skeleton)**

```vue
<template>
  <div class="room">
    <h2>Room: {{ code }}</h2>
    <PlayerList :players="players" />
    <p v-if="!amReady">Waiting for all players to ready...</p>
    <button @click="ready" :disabled="amReady">Ready</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import PlayerList from '@/components/room/PlayerList.vue'

const route = useRoute()
const code = route.params.code as string
const players = ref<any[]>([])
const amReady = ref(false)

function ready() {
  amReady.value = true
}
</script>

<style scoped>
.room {
  padding: 2rem;
}
</style>
```

- [ ] **Step 5: Create GameView.vue (skeleton)**

```vue
<template>
  <div class="game-view">
    <GameBoard />
  </div>
</template>

<script setup lang="ts">
import GameBoard from '@/components/game/GameBoard.vue'
</script>

<style scoped>
.game-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(client): add router and view skeletons"
```

---

### Task 19: Socket composable and Pinia store

**Files:**
- Create: `packages/client/src/composables/useSocket.ts`
- Create: `packages/client/src/composables/useRoom.ts`
- Create: `packages/client/src/composables/useGame.ts`
- Create: `packages/client/src/stores/game.ts`

- [ ] **Step 1: Create useSocket.ts**

```typescript
import { io, Socket } from 'socket.io-client'
import { ref, onUnmounted } from 'vue'

const socket = ref<Socket | null>(null)

export function useSocket() {
  function connect() {
    if (!socket.value) {
      socket.value = io('/', {
        transports: ['websocket', 'polling'],
      })
    }
    return socket.value
  }

  function disconnect() {
    socket.value?.disconnect()
    socket.value = null
  }

  return { socket, connect, disconnect }
}
```

- [ ] **Step 2: Create useRoom.ts**

```typescript
import { ref } from 'vue'
import { useSocket } from './useSocket'
import type { PlayerInfo } from '@/types'
import { useRouter } from 'vue-router'

export function useRoom() {
  const { socket } = useSocket()
  const router = useRouter()
  const roomCode = ref('')
  const players = ref<PlayerInfo[]>([])
  const amReady = ref(false)

  function createRoom(playerName: string, maxPlayers: number) {
    socket.value?.emit('create_room', { name: playerName, maxPlayers })
  }

  function joinRoom(code: string, playerName: string) {
    socket.value?.emit('join_room', { roomCode: code, playerName })
  }

  function ready() {
    socket.value?.emit('ready')
    amReady.value = true
  }

  function setupListeners() {
    socket.value?.on('room_created', ({ roomCode: code }) => {
      roomCode.value = code
      router.push(`/room/${code}`)
    })

    socket.value?.on('player_joined', ({ players: plist }) => {
      players.value = plist as PlayerInfo[]
    })

    socket.value?.on('player_left', ({ players: plist }) => {
      players.value = plist as PlayerInfo[]
    })

    socket.value?.on('game_started', ({ hand, players: gamePlayers, leadPlayerId }) => {
      router.push(`/game/${roomCode.value}`)
    })

    socket.value?.on('error', ({ message }) => {
      alert(message)
    })
  }

  return { roomCode, players, amReady, createRoom, joinRoom, ready, setupListeners }
}
```

- [ ] **Step 3: Create useGame.ts**

```typescript
import { ref } from 'vue'
import { useSocket } from './useSocket'
import type { Card } from '@79523/engine'

export function useGame() {
  const { socket } = useSocket()
  const myHand = ref<Card[]>([])
  const tableCards = ref<Card[]>([])
  const scores = ref<Record<string, number>>({})
  const isMyTurn = ref(false)
  const timeLeft = ref(30)
  const deckCount = ref(0)
  const gamePhase = ref('')

  function play(cards: Card[]) {
    socket.value?.emit('play', { cards })
  }

  function pass() {
    socket.value?.emit('pass')
  }

  function setupListeners() {
    socket.value?.on('game_started', ({ hand, players, leadPlayerId }) => {
      myHand.value = hand
      for (const p of players) {
        scores.value[p.id] = p.score
      }
    })

    socket.value?.on('your_turn', ({ timeout }) => {
      isMyTurn.value = true
      timeLeft.value = timeout
    })

    socket.value?.on('play_made', ({ playerId, play, tableCards: tc }) => {
      tableCards.value = tc
      isMyTurn.value = false
    })

    socket.value?.on('round_result', ({ winnerId, scores: newScores }) => {
      for (const s of newScores) {
        scores.value[s.id] = s.score
      }
    })

    socket.value?.on('draw_card', ({ cards }) => {
      myHand.value.push(...cards)
    })

    socket.value?.on('game_over', ({ scores: finalScores }) => {
      for (const s of finalScores) {
        scores.value[s.id] = s.totalScore
      }
    })

    socket.value?.on('full_state', ({ myHand: hand, deck, currentPlayerIndex }) => {
      myHand.value = hand
      deckCount.value = deck ? deck.length : 0
    })
  }

  return { myHand, tableCards, scores, isMyTurn, timeLeft, deckCount, gamePhase, play, pass, setupListeners }
}
```

- [ ] **Step 4: Create stores/game.ts**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Card, Play, GamePhase } from '@79523/engine'

export const useGameStore = defineStore('game', () => {
  const myHand = ref<Card[]>([])
  const tableCards = ref<Card[]>([])
  const selectedCards = ref<Card[]>([])
  const scores = ref<Record<string, number>>({})
  const isMyTurn = ref(false)
  const timeLeft = ref(30)
  const deckCount = ref(104)
  const phase = ref<GamePhase | ''>('')
  const currentPlayerId = ref('')
  const myId = ref('')

  const selectedCount = computed(() => selectedCards.value.length)

  function selectCard(card: Card) {
    const idx = selectedCards.value.findIndex(c => c.suit === card.suit && c.rank === card.rank)
    if (idx >= 0) {
      selectedCards.value.splice(idx, 1)
    } else {
      selectedCards.value.push(card)
    }
  }

  function clearSelection() {
    selectedCards.value = []
  }

  function removeFromHand(cards: Card[]) {
    myHand.value = myHand.value.filter(
      c => !cards.some(pc => pc.suit === c.suit && pc.rank === c.rank)
    )
  }

  function addToHand(cards: Card[]) {
    myHand.value.push(...cards)
  }

  return {
    myHand, tableCards, selectedCards, scores,
    isMyTurn, timeLeft, deckCount, phase,
    currentPlayerId, myId, selectedCount,
    selectCard, clearSelection, removeFromHand, addToHand,
  }
})
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): add socket composables and Pinia store"
```

---

### Task 20: Room components

**Files:**
- Create: `packages/client/src/components/room/CreateRoom.vue`
- Create: `packages/client/src/components/room/JoinRoom.vue`
- Create: `packages/client/src/components/room/PlayerList.vue`

- [ ] **Step 1: Create CreateRoom.vue**

```vue
<template>
  <div class="create-room">
    <input v-model="playerName" placeholder="你的昵称" maxlength="12" />
    <select v-model.number="maxPlayers">
      <option :value="2">2 人</option>
      <option :value="3">3 人</option>
      <option :value="4" selected>4 人</option>
      <option :value="5">5 人</option>
      <option :value="6">6 人</option>
    </select>
    <button @click="create" :disabled="!playerName">创建房间</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoom } from '@/composables/useRoom'
import { useSocket } from '@/composables/useSocket'

const { connect } = useSocket()
const { createRoom, setupListeners } = useRoom()

const playerName = ref('')
const maxPlayers = ref(4)

function create() {
  connect()
  setupListeners()
  createRoom(playerName.value, maxPlayers.value)
}
</script>

<style scoped>
.create-room {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 300px;
}
input, select, button {
  padding: 0.75rem;
  font-size: 1rem;
  border-radius: 8px;
  border: 1px solid #ccc;
}
button {
  background: #4CAF50;
  color: white;
  border: none;
  cursor: pointer;
}
button:disabled {
  background: #ccc;
}
</style>
```

- [ ] **Step 2: Create JoinRoom.vue**

```vue
<template>
  <div class="join-room">
    <input v-model="playerName" placeholder="你的昵称" maxlength="12" />
    <input v-model="code" placeholder="房间码（6位）" maxlength="6" style="text-transform: uppercase" />
    <button @click="join" :disabled="!playerName || code.length !== 6">加入房间</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoom } from '@/composables/useRoom'
import { useSocket } from '@/composables/useSocket'

const { connect } = useSocket()
const { joinRoom, setupListeners } = useRoom()

const playerName = ref('')
const code = ref('')

function join() {
  connect()
  setupListeners()
  joinRoom(code.value.toUpperCase(), playerName.value)
}
</script>

<style scoped>
.join-room {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 300px;
}
input, button {
  padding: 0.75rem;
  font-size: 1rem;
  border-radius: 8px;
  border: 1px solid #ccc;
}
button {
  background: #2196F3;
  color: white;
  border: none;
  cursor: pointer;
}
button:disabled {
  background: #ccc;
}
</style>
```

- [ ] **Step 3: Create PlayerList.vue**

```vue
<template>
  <div class="player-list">
    <div v-for="player in players" :key="player.id" class="player-item">
      <span class="status" :class="{ ready: player.ready }">●</span>
      <span>{{ player.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  players: { id: string; name: string; ready: boolean }[]
}>()
</script>

<style scoped>
.player-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 300px;
}
.player-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #f5f5f5;
  border-radius: 8px;
}
.status {
  color: #ccc;
}
.status.ready {
  color: #4CAF50;
}
</style>
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(client): add room components"
```

---

### Task 21: Game components

**Files:**
- Create: `packages/client/src/components/common/CardSprite.vue`
- Create: `packages/client/src/components/game/PlayerHand.vue`
- Create: `packages/client/src/components/game/TableCards.vue`
- Create: `packages/client/src/components/game/ScoreDisplay.vue`
- Create: `packages/client/src/components/game/TurnIndicator.vue`
- Create: `packages/client/src/components/game/DeckInfo.vue`
- Create: `packages/client/src/components/game/PlayerSlot.vue`
- Create: `packages/client/src/components/game/GameBoard.vue`

- [ ] **Step 1: Create CardSprite.vue**

```vue
<template>
  <div class="card" :class="{ selected, dimmed }" @click="$emit('select')">
    <span class="rank">{{ rankLabel }}</span>
    <span class="suit">{{ suitLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Suit, Rank } from '@79523/engine'
import type { Card } from '@79523/engine'

const props = defineProps<{
  card: Card
  selected?: boolean
  dimmed?: boolean
}>()

defineEmits<{ select: [] }>()

const rankLabels: Record<number, string> = {
  [Rank.Four]: '4', [Rank.Six]: '6', [Rank.Eight]: '8',
  [Rank.Ten]: '10', [Rank.Jack]: 'J', [Rank.Queen]: 'Q',
  [Rank.King]: 'K', [Rank.Ace]: 'A', [Rank.Three]: '3',
  [Rank.Two]: '2', [Rank.Five]: '5', [Rank.Nine]: '9',
  [Rank.Seven]: '7',
}

const suitLabels: Record<number, string> = {
  [Suit.Spade]: '♠', [Suit.Heart]: '♥',
  [Suit.Club]: '♣', [Suit.Diamond]: '♦',
}

const rankLabel = computed(() => rankLabels[props.card.rank])
const suitLabel = computed(() => suitLabels[props.card.suit])
</script>

<style scoped>
.card {
  width: 48px;
  height: 68px;
  border: 2px solid #333;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: white;
  cursor: pointer;
  user-select: none;
  transition: transform 0.1s;
  flex-shrink: 0;
}
.card.selected {
  transform: translateY(-12px);
  border-color: #FFD700;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}
.card.dimmed {
  opacity: 0.5;
  cursor: not-allowed;
}
.rank {
  font-size: 1rem;
  font-weight: bold;
}
.suit {
  font-size: 0.9rem;
}
</style>
```

- [ ] **Step 2: Create PlayerHand.vue**

```vue
<template>
  <div class="player-hand">
    <div class="hand-area">
      <CardSprite
        v-for="(card, i) in myHand"
        :key="`${card.suit}-${card.rank}-${i}`"
        :card="card"
        :selected="isSelected(card)"
        :dimmed="!isMyTurn"
        @select="onSelectCard(card)"
      />
    </div>
    <div class="actions">
      <button @click="onPlay" :disabled="!canPlay">出牌</button>
      <button @click="onPass" :disabled="!isMyTurn || mustPlay">过</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { identify } from '@79523/engine'
import type { Card } from '@79523/engine'
import CardSprite from '@/components/common/CardSprite.vue'

const store = useGameStore()

const props = defineProps<{
  myHand: Card[]
  isMyTurn: boolean
  mustPlay: boolean
}>()

const emit = defineEmits<{
  play: [cards: Card[]]
  pass: []
}>()

function isSelected(card: Card): boolean {
  return store.selectedCards.some(c => c.suit === card.suit && c.rank === card.rank)
}

function onSelectCard(card: Card) {
  if (!props.isMyTurn) return
  store.selectCard(card)
}

const canPlay = computed(() => {
  if (!props.isMyTurn) return false
  if (store.selectedCards.length === 0) return false
  return identify(store.selectedCards) !== null
})

function onPlay() {
  if (!canPlay.value) return
  emit('play', [...store.selectedCards])
  store.clearSelection()
}

function onPass() {
  if (props.mustPlay) return
  emit('pass')
}
</script>

<style scoped>
.player-hand {
  padding: 0.5rem;
  background: linear-gradient(to top, #1a1a2e, #16213e);
}
.hand-area {
  display: flex;
  justify-content: center;
  gap: 2px;
  overflow-x: auto;
  padding: 0.5rem 0;
}
.actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  padding: 0.5rem 0;
}
button {
  padding: 0.6rem 2rem;
  font-size: 1rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
}
button:first-child {
  background: #4CAF50;
  color: white;
}
button:last-child {
  background: #f44336;
  color: white;
}
button:disabled {
  background: #666;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 3: Create TableCards.vue**

```vue
<template>
  <div class="table-cards">
    <CardSprite
      v-for="(card, i) in cards"
      :key="`t-${card.suit}-${card.rank}-${i}`"
      :card="card"
    />
  </div>
</template>

<script setup lang="ts">
import type { Card } from '@79523/engine'
import CardSprite from '@/components/common/CardSprite.vue'

defineProps<{ cards: Card[] }>()
</script>

<style scoped>
.table-cards {
  display: flex;
  gap: 4px;
  justify-content: center;
  flex-wrap: wrap;
  min-height: 72px;
  padding: 0.5rem;
}
</style>
```

- [ ] **Step 4: Create ScoreDisplay.vue**

```vue
<template>
  <div class="score-display">
    <div v-for="(score, id) in scores" :key="id" class="score-item">
      {{ playerNames[id] || id }}: {{ score }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  scores: Record<string, number>
  playerNames: Record<string, string>
}>()
</script>

<style scoped>
.score-display {
  display: flex;
  gap: 1rem;
  justify-content: center;
  padding: 0.5rem;
  font-size: 0.9rem;
  background: rgba(0,0,0,0.05);
}
.score-item {
  font-weight: 600;
}
</style>
```

- [ ] **Step 5: Create TurnIndicator.vue**

```vue
<template>
  <div class="turn-indicator" v-if="isMyTurn">
    ⏱ 你的回合 {{ timeLeft }}s
  </div>
  <div class="turn-indicator wait" v-else>
    等待 {{ currentPlayer }} 出牌...
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isMyTurn: boolean
  currentPlayer: string
  timeLeft: number
}>()
</script>

<style scoped>
.turn-indicator {
  text-align: center;
  padding: 0.5rem;
  font-weight: bold;
  background: #4CAF50;
  color: white;
}
.turn-indicator.wait {
  background: #FF9800;
}
</style>
```

- [ ] **Step 6: Create DeckInfo.vue**

```vue
<template>
  <div class="deck-info">
    剩余: {{ count }} 张
  </div>
</template>

<script setup lang="ts">
defineProps<{ count: number }>()
</script>

<style scoped>
.deck-info {
  text-align: center;
  padding: 0.25rem;
  font-size: 0.85rem;
  color: #666;
}
</style>
```

- [ ] **Step 7: Create PlayerSlot.vue**

```vue
<template>
  <div class="player-slot" :class="{ active: isActive }">
    <div class="name">{{ name }}</div>
    <div class="cards-face-down">
      <div v-for="i in cardCount" :key="i" class="card-back"></div>
    </div>
    <div class="score">{{ score }}分</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string
  cardCount: number
  score: number
  isActive: boolean
}>()
</script>

<style scoped>
.player-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  border-radius: 8px;
}
.player-slot.active {
  background: rgba(76, 175, 80, 0.15);
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.3);
}
.name {
  font-weight: bold;
  font-size: 0.9rem;
}
.cards-face-down {
  display: flex;
  gap: 2px;
}
.card-back {
  width: 24px;
  height: 34px;
  background: linear-gradient(135deg, #1a5276, #2980b9);
  border-radius: 3px;
  border: 1px solid #1a5276;
}
.score {
  font-size: 0.8rem;
  color: #666;
}
</style>
```

- [ ] **Step 8: Create GameBoard.vue**

```vue
<template>
  <div class="game-board">
    <!-- Other players -->
    <div class="other-players">
      <PlayerSlot
        v-for="(p, i) in otherPlayers"
        :key="p.id"
        :name="p.name"
        :cardCount="p.cardCount"
        :score="p.score"
        :isActive="p.id === currentPlayerId"
      />
    </div>

    <!-- Table center -->
    <div class="table-center">
      <DeckInfo :count="deckCount" />
      <TurnIndicator
        :isMyTurn="isMyTurn"
        :currentPlayer="currentPlayerName"
        :timeLeft="timeLeft"
      />
      <TableCards :cards="tableCards" />
      <ScoreDisplay :scores="scores" :playerNames="playerNames" />
    </div>

    <!-- My hand -->
    <PlayerHand
      :myHand="myHand"
      :isMyTurn="isMyTurn"
      :mustPlay="mustPlay"
      @play="onPlay"
      @pass="onPass"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import type { Card } from '@79523/engine'
import PlayerHand from './PlayerHand.vue'
import TableCards from './TableCards.vue'
import ScoreDisplay from './ScoreDisplay.vue'
import TurnIndicator from './TurnIndicator.vue'
import DeckInfo from './DeckInfo.vue'
import PlayerSlot from './PlayerSlot.vue'

const store = useGameStore()

const props = defineProps<{
  players: { id: string; name: string; cardCount: number; score: number }[]
  currentPlayerId: string
  playerNames: Record<string, string>
}>()

const emit = defineEmits<{
  play: [cards: Card[]]
  pass: []
}>()

const myHand = computed(() => store.myHand)
const tableCards = computed(() => store.tableCards)
const isMyTurn = computed(() => store.isMyTurn)
const timeLeft = computed(() => store.timeLeft)
const deckCount = computed(() => store.deckCount)
const scores = computed(() => store.scores)
const currentPlayerName = computed(() => props.playerNames[props.currentPlayerId] || '...')
const mustPlay = computed(() => store.isMyTurn && !store.tableCards.length)

const otherPlayers = computed(() => props.players.filter(p => p.id !== store.myId))

function onPlay(cards: Card[]) {
  emit('play', cards)
}

function onPass() {
  emit('pass')
}
</script>

<style scoped>
.game-board {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100svh;
}
.other-players {
  display: flex;
  justify-content: center;
  gap: 1rem;
  padding: 0.5rem;
  flex-wrap: wrap;
}
.table-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  overflow-y: auto;
}
</style>
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(client): add game components"
```

---

## Phase 5: Integration

### Task 22: Integration test with 4 browser tabs

- [ ] **Step 1: Start server and client**

```bash
cd /home/michael/Documents/repository/agent_harness/79523
pnpm dev:server &
sleep 2
pnpm dev:client &
sleep 3
```

- [ ] **Step 2: Manual verification checklist**

1. Open 4 browser tabs to `http://localhost:5173`
2. Tab 1: Create room (4 players) → note the room code
3. Tabs 2-4: Join room with the same code
4. All tabs: Click "Ready"
5. Verify game starts, hand cards appear
6. Verify first player (smallest card holder) gets "your turn"
7. Play through a full round: play → others pass/follow → verify scores update
8. Play until game end: verify game_over event fires
9. Kill one tab → verify disconnection notification
10. Reopen tab with reconnect → verify state restore

- [ ] **Step 3: Fix issues found**

Address bugs discovered during manual testing. Focus on:
- Socket event timing (race conditions)
- Hand synchronization after reconnect
- Score calculation accuracy
- Edge cases: empty deck, all players pass, etc.

---

## Verification

```bash
# Run all tests
pnpm test

# Expected: ~80 engine tests pass, 5 server tests pass
# Client: manual testing with 4 browser tabs
```
