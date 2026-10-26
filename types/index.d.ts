export type Mood =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'happy'
  | 'shock'
  | 'sad'
  | 'sleepy'
  | 'love'
  | 'transform'
  | 'blast'
  | 'welcome'
  | 'boot'
  | 'ditto'
  | 'mimikyu'
  | 'ranranru'
  | 'aqua'
  | 'excalibur'
  | 'buster'
  | 'spark'
  | 'world'
  | 'lunatic'

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

declare module 'claude-code' {
  interface PluginState {
    bunny: { pet: Bunny }
  }
}
