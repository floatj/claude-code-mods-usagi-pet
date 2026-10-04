import type { Game } from '../types'

// A three-lane runner seen from above: trains and coins come down the lanes
// toward the rabbit on the bottom row, who steps left and right.
export const LANES = 3
export const TRACK_ROWS = 7
export const GAME_TICK_MS = 200
export const LANE_WIDTH = 5
const COIN_SCORE = 5

const EMPTY = ' '.repeat(LANES)
// What a new row may hold, one character per lane: `#` a train, `o` a coin.
// Never a train in every lane, so there is always a way through.
const SPAWNS = [
  '#  ', ' # ', '  #', '## ', '# #', ' ##',
  'o  ', ' o ', '  o', '#o ', ' o#', 'o #', '#  ', '  #',
] as const

export const CLOSED: Game = {
  isOpen: false,
  isOver: false,
  lane: 1,
  rows: Array.from({ length: TRACK_ROWS }, () => EMPTY),
  score: 0,
  best: 0,
  tick: 0,
  moved: 0,
}

export const start = (g: Game): Game => ({ ...CLOSED, isOpen: true, best: g.best })

export const close = (g: Game): Game => ({ ...g, isOpen: false })

// Clock periods per row the track moves: it speeds up as the score grows.
const periodOf = (score: number) => (score < 15 ? 3 : score < 45 ? 2 : 1)

// What standing where she now stands does: a train ends the run, a coin scores.
const land = (g: Game): Game => {
  const last = g.rows[TRACK_ROWS - 1] ?? EMPTY
  const under = last[g.lane]

  if (under === '#') {
    return { ...g, isOver: true, best: Math.max(g.best, g.score) }
  }

  if (under === 'o') {
    const taken = last.slice(0, g.lane) + ' ' + last.slice(g.lane + 1)

    return { ...g, score: g.score + COIN_SCORE, rows: [...g.rows.slice(0, -1), taken] }
  }

  return g
}

export const steer = (g: Game, by: -1 | 1): Game => {
  const lane = Math.max(0, Math.min(LANES - 1, g.lane + by))

  return g.isOver || !g.isOpen || lane === g.lane ? g : land({ ...g, lane })
}

/** One clock period. `roll` in [0, 1) picks what the next row holds. */
export const advance = (g: Game, roll: number): Game => {
  if (g.isOver || !g.isOpen) {
    return g
  }

  const tick = g.tick + 1

  if (tick % periodOf(g.score) !== 0) {
    return { ...g, tick }
  }

  // Every other row is clear, so a lane change always has a row to happen in.
  const spawned = g.moved % 2 === 0 ? (SPAWNS[Math.floor(roll * SPAWNS.length)] ?? EMPTY) : EMPTY
  const rows = [spawned, ...g.rows.slice(0, -1)]

  return land({ ...g, tick, rows, moved: g.moved + 1, score: g.score + 1 })
}

export type Cell = { text: string; kind: 'empty' | 'train' | 'coin' | 'rabbit' }

const DRAWN: Record<string, Cell> = {
  '#': { text: ' ▓▓▓ ', kind: 'train' },
  o: { text: '  ●  ', kind: 'coin' },
}
const NOTHING: Cell = { text: ' '.repeat(LANE_WIDTH), kind: 'empty' }

/** The track as cells to draw, the rabbit on its last two rows. */
export const trackOf = (g: Game): Cell[][] =>
  g.rows.map((row, at) =>
    Array.from({ length: LANES }, (_, lane): Cell => {
      const item = DRAWN[row[lane] ?? ' ']
      const isHers = lane === g.lane

      if (isHers && at === TRACK_ROWS - 1) {
        return { text: g.isOver ? '(xωx)' : '(·ω·)', kind: 'rabbit' }
      }

      if (isHers && at === TRACK_ROWS - 2 && item === undefined) {
        return { text: ' ∩ ∩ ', kind: 'rabbit' }
      }

      return item ?? NOTHING
    }),
  )
