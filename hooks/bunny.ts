import type { Bunny, Mood } from '../types'

export const TICK_MS = 500
// An idle rabbit dozes off at once: idle is only the moment before sleep.
export const SLEEP_AFTER_MS = 0

// Moods that pass by themselves, and how long each lasts.
const TTL: Partial<Record<Mood, number>> = {
  happy: 6000,
  shock: 3000,
  sad: 5000,
  love: 3000,
}

export const INITIAL: Bunny = {
  mood: 'idle',
  since: 0,
  tick: 0,
  tool: '',
  isBusy: false,
  pets: 0,
}

export const setMood = (b: Bunny, mood: Mood, now: number, tool = ''): Bunny =>
  b.mood === mood && b.tool === tool ? b : { ...b, mood, tool, since: now }

/** One clock period: advance the frame, and let a mood run out. */
export const step = (b: Bunny, now: number): Bunny => {
  const next = { ...b, tick: b.tick + 1 }
  const age = now - b.since
  const ttl = TTL[b.mood]

  if (ttl !== undefined && age > ttl) {
    return { ...next, mood: b.isBusy ? 'thinking' : 'idle', since: now }
  }

  if (b.mood === 'idle' && age > SLEEP_AFTER_MS) {
    return { ...next, mood: 'sleepy', since: now }
  }

  return next
}

// The status line's rabbit, drawn the same way: ears, face, paws.
const EARS = ' ∩   ∩ '
const EARS_TWITCH = ' ∩   n '
const EARS_DOWN = ' n   n '
const PAWS = '/ >    '
const HEART = '/ > ♡  '

type Frame = readonly [fx: string, ears: string, face: string, body: string]

const FRAMES: Record<Mood, readonly Frame[]> = {
  idle: [
    ['', EARS, '( ·ω· )', HEART],
    ['', EARS, '( ·ω· )', HEART],
    ['', EARS_TWITCH, '( ·ω· )', HEART],
    ['', EARS, '( ·ω· )', HEART],
    ['', EARS, '( -ω- )', HEART],
    ['', EARS, '( ·ω· )', HEART],
    ['', EARS, '(·ω·  )', PAWS],
    ['', EARS, '(·ω·  )', PAWS],
    ['', EARS, '(  ·ω·)', PAWS],
    ['', EARS, '( ·ω· )', '/ >  ♡ '],
  ],
  thinking: [
    ['      . ', EARS, '( ·ω· )', PAWS],
    ['     o .', EARS, '( ·ω· )', PAWS],
    ['    O o ', EARS_TWITCH, '( -ω- )', PAWS],
    ['    ?   ', EARS, '( ·ω· )', PAWS],
  ],
  working: [
    ['', EARS, '( ·ω· )', '/ > ▭▭▭/'],
    ['', EARS, '( ·ω· )', '/ < ▭▭▭/'],
    ['', EARS_TWITCH, '( >ω· )', '/ > ▭▭▭/'],
    ['', EARS, '( ·ω· )', '/ < ▭▭▭/'],
  ],
  happy: [
    [' ✦      ', EARS, '( ^ω^ )', HEART],
    ['      ✧ ', EARS, '( ^ω^ )', '\\ > ♡ /'],
    ['✧     ✦ ', EARS, '( ^ω^ )', HEART],
    ['   ✦    ', EARS, '( ^ω^ )', '\\ > ♡ /'],
  ],
  shock: [
    ['      !!', EARS, '( oωo )', PAWS],
    ['      ! ', EARS_TWITCH, '( oωo )', PAWS],
  ],
  sad: [
    ['', EARS_DOWN, '( >ω< )', PAWS],
    ['', EARS_DOWN, '( ;ω; )', PAWS],
    ['', EARS_DOWN, '( ;ω; )', PAWS],
  ],
  sleepy: [
    ['  z     ', EARS, '( -ω- )', PAWS],
    ['  zZ    ', EARS, '( -ω- )', PAWS],
    ['  zZZ   ', EARS, '( -ω- )', PAWS],
    ['  zZZ.  ', EARS, '( -ω- )', PAWS],
    ['  zZZ.. ', EARS, '( -ω- )', PAWS],
    ['  zZZ...', EARS, '( -o- )', PAWS],
  ],
  love: [
    ['  ♡     ', EARS, '( ♡ω♡ )', HEART],
    ['    ♡ ♡ ', EARS_TWITCH, '( ^ω^ )', HEART],
  ],
}

/** The rabbit's own color, the status line's. */
export const BODY_COLOR = '#ffaf5f'

export const COLOR: Record<Mood, string | undefined> = {
  idle: undefined,
  thinking: 'cyan',
  working: 'yellow',
  happy: 'green',
  shock: 'red',
  sad: 'blue',
  sleepy: undefined,
  love: 'magenta',
}

// The sleeper breathes slowly; everything else moves at the clock's pace.
const PERIODS: Partial<Record<Mood, number>> = { sleepy: 2, idle: 2 }

const WIDTH = 8

export const frameOf = (b: Bunny): Frame => {
  const frames = FRAMES[b.mood]
  const at = Math.floor(b.tick / (PERIODS[b.mood] ?? 1))

  const [fx, ears, face, body] = frames[at % frames.length] ?? frames[0]!

  // One width for every row, so centering keeps the ears over the face.
  return [fx.padEnd(WIDTH), ears.padEnd(WIDTH), face.padEnd(WIDTH), body.padEnd(WIDTH)]
}

const TOOL_LABEL: Record<string, string> = {
  Bash: '跑指令中',
  Read: '讀檔案中',
  Edit: '改程式中',
  Write: '寫檔案中',
  Grep: '找東西中',
  Glob: '找東西中',
  WebFetch: '上網查中',
  WebSearch: '上網查中',
  Agent: '叫小幫手',
}

export const captionOf = (b: Bunny): string => {
  switch (b.mood) {
    case 'idle':
      return '發呆中'
    case 'thinking':
      return '思考中' + '.'.repeat((b.tick % 3) + 1)
    case 'working':
      return TOOL_LABEL[b.tool] ?? `${b.tool || '工作'}中`
    case 'happy':
      return '完成了！'
    case 'shock':
      return '收到！'
    case 'sad':
      return '嗚…出錯了'
    case 'sleepy':
      return '睡著了'
    case 'love':
      return '♡'
  }
}

// The status line's laptop, `▭▭▭/`, with its lid drawn large enough to read:
// a slanted screen rising from the keyboard's far end, beside her.
export const SCENE_WIDTH = 18

/** The laptop's own color, apart from the rabbit's. */
export const LAPTOP_COLOR = '#af87ff'

const SCREENS: readonly (readonly [string, string])[] = [
  ['>_   ', '     '],
  ['>ls_ ', '     '],
  ['>ls  ', '▪▪ ▪▪'],
  ['▪▪ ▪▪', '>_   '],
  ['▪▪ ▪▪', '>git_'],
  ['>git ', '▪▪▪ ▪'],
  ['▪▪▪ ▪', '▪ ▪▪▪'],
  ['▪ ▪▪▪', '>_   '],
]

// What the lid shows while nobody types: its maker's name.
const CLOSED = ['NZXT ', '     '] as const

export type Row = readonly [rabbit: string, laptop: string]

/** The rabbit's three rows, each with the part of the laptop beside it. */
export const sceneOf = (b: Bunny, hasLaptop: boolean): readonly Row[] => {
  const [, ears, face, body] = frameOf(b)

  if (!hasLaptop) {
    return [
      [ears, ''],
      [face, ''],
      [body, ''],
    ]
  }

  const isTyping = b.mood === 'working'
  const typed = SCREENS[b.tick % SCREENS.length] ?? CLOSED
  const [top, bottom] = isTyping ? typed : CLOSED
  // The lid's lower edge runs under whatever its last row shows.
  const edged = bottom.replaceAll(' ', '_')
  // Both paws on the keys while she types, one after the other.
  const typing = b.tick % 2 === 0 ? '/ >  > ' : '/ < >  '
  // A raised paw is drawn a cell in, so it never touches the keyboard.
  const still = body.trimEnd().replace(/ \/$/, '/').padEnd(7)
  const paws = isTyping ? typing : still

  return [
    [ears.padEnd(12), '______'],
    [face.padEnd(11), `/${top}/`],
    [paws, `▭▭▭/${edged}/`],
  ]
}
