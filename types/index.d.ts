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
  /** The tool in flight while `working`. */
  tool: string
  /** Whether a turn is running, so a passing mood returns to `thinking`. */
  isBusy: boolean
  pets: number
}

declare module 'claude-code' {
  interface PluginState {
    bunny: { pet: Bunny }
  }
}
