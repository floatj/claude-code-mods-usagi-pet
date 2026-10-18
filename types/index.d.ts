export type Mood =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'happy'
  | 'shock'
  | 'sad'
  | 'sleepy'
  | 'love'

export type Bunny = {
  mood: Mood
  /** Epoch ms the mood began. */
  since: number
  /** Animation frame counter, one per clock period. */
  tick: number
  /** The `tick` the mood began on: a passing mood's scene plays from it. */
  moodTick: number
  /** The `tick` the turn began on: a long turn's acts count from it. */
  turnTick: number
  /** The tool in flight while `working`. */
  tool: string
  /** Whether a turn is running, so a passing mood returns to `thinking`. */
  isBusy: boolean
  pets: number
}

export type Game = {
  /** Whether the pane shows the game in place of the rabbit's desk. */
  isOpen: boolean
  isOver: boolean
  /** The lane she stands in, 0 the leftmost. */
  lane: number
  /** The track from the far end to her row, one character per lane. */
  rows: string[]
  score: number
  /** The best score of this session. */
  best: number
  tick: number
  /** Rows the track has moved, which decides where the clear rows fall. */
  moved: number
}

declare module 'claude-code' {
  interface PluginState {
    bunny: { pet: Bunny; game: Game }
  }
}
