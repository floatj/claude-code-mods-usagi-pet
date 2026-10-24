import type { Bunny } from '../types'
import type { Weather } from './weather'

// The rabbit's stage, after clawd-actor's (github.com/BrianHuang813/clawd-actor): a scene
// draws her and her props for one frame, and the frames follow what the turn is doing.
// She is a rabbit-eared maid in blue and white. The stage is a canvas of half-cell
// pixels, two to a cell (▀ ▄ █), so she is painted in several colors and hops a pixel
// at a time.
// Pure functions only, so the frames can be checked without the engine.

export const STAGE_ROWS = 9
export const MAX_STAGE = 30
export const FRAME_MS = 150
// Each act of a long turn runs a quarter of a minute.
export const ACT_FRAMES = Math.round(15_000 / FRAME_MS)

const PX_ROWS = STAGE_ROWS * 2
// A scene's coordinates start a cell below the canvas's top: the cell above is
// headroom for her ears when she hops.
const SKY = 1
// The pixel row under her feet, in a scene's coordinates.
const FLOOR = (STAGE_ROWS - SKY) * 2
// Her sprite's columns: nine of head and one each side for a raised hand or a lop ear.
const SPRITE = 11
const SPRITE_ROWS = 16
// The columns she and a prop beside her take; on a narrower stage she is drawn alone.
const ROOMY = 20
const PROP_X = SPRITE

/** The white of her ears and apron. */
export const FUR_COLOR = '#f6f4ef'
/** The laptop's own color, apart from the rabbit's. */
export const LAPTOP_COLOR = '#9cc3f5'

const GRAY = '#8a9096'
const RED = '#ff5f5f'
const YELLOW = '#ffd75f'
const CYAN = '#5fd7ff'
const PINK = '#ff8fa3'
const MAGENTA = '#ff87d7'
const GREEN = '#6fcf6f'
const SCREEN = '#1b1b2f'

// What each letter of a sprite paints; any other character is see-through.
const INKS: Record<string, string> = {
  F: FUR_COLOR,
  P: '#ff9db0', // inner ear
  T: '#cdd6ee', // hair
  t: '#8f9cc4', // hair in shadow
  S: '#ffdfc8', // skin
  B: '#ff9fb2', // blush
  K: '#2a2530', // eye
  k: '#4f8ff7', // iris
  X: '#1b2a48', // the night sky
  J: '#8fd3ff', // the sky by day
  e: '#cfe0ef', // under a cloud
  M: '#a8558a', // high in the sky at dusk
  Z: '#ff7a59', // the sky at dusk
  z: '#ffb070', // low over the horizon at dusk, and the sun on the sea
  m: '#4a3466', // the sea at dusk
  A: '#5b9bf0', // dress
  a: '#3565c0', // ribbon and shoes
  C: '#c8ecff', // a tear
  D: '#ffffff', // diamond earrings
  d: '#ffffff', // a second star
  V: '#a8dcf5', // gloves
  H: '#ff4d6d', // heart
  U: LAPTOP_COLOR,
  u: '#5b8fd8',
  Q: '#cfe2fb', // the keyboard
  W: '#ececec',
  w: '#aab0b6',
  s: GRAY,
  G: GREEN,
  g: '#3f9f4f',
  O: '#ff7a1a', // carrot
  o: '#d95f0e',
  N: '#9b6a3a', // wood and soil
  n: '#6b4423',
  L: '#5fafff', // water
  l: '#2f6fd0',
  Y: YELLOW,
  R: RED,
  I: '#4a4a55', // ink on paper
}

/** `isWorn` by her: a pixel painted over its cell later hides it. */
type Glyph = { ch: string; color?: string; bg?: string; isWorn?: boolean }
type Canvas = {
  width: number
  px: (string | undefined)[][]
  /** A pixel's left and right halves, where they differ; `px` is how it looks whole. */
  halves: (Half | undefined)[][]
  glyphs: (Glyph | undefined)[][]
}
type Half = readonly [string | undefined, string | undefined]

const canvasOf = (width: number): Canvas => ({
  width,
  px: Array.from({ length: PX_ROWS }, () => Array<string | undefined>(width).fill(undefined)),
  halves: Array.from({ length: PX_ROWS }, () => Array<Half | undefined>(width).fill(undefined)),
  glyphs: Array.from({ length: STAGE_ROWS }, () => Array<Glyph | undefined>(width).fill(undefined)),
})

const dot = (c: Canvas, x: number, y: number, color: string) => {
  const line = c.px[y + SKY * 2]

  if (line && x >= 0 && x < c.width) {
    line[x] = color
    c.halves[y + SKY * 2]![x] = undefined
    const worn = c.glyphs[Math.floor(y / 2) + SKY]

    if (worn?.[x]?.isWorn) {
      worn[x] = undefined
    }
  }
}

/** Splits a painted pixel in two, drawn so where its cell can show it. */
const split = (c: Canvas, x: number, y: number, left: string | undefined, right: string | undefined) => {
  const line = c.halves[y + SKY * 2]

  if (line && x >= 0 && x < c.width) {
    line[x] = [left, right]
  }
}

/** Paints a sprite's rows with their top left at pixel (x, y). */
const paint = (c: Canvas, x: number, y: number, rows: readonly string[], inks = INKS) => {
  rows.forEach((row, dy) => {
    ;[...row].forEach((letter, dx) => {
      const color = inks[letter]

      if (color !== undefined) {
        dot(c, x + dx, y + dy, color)
      }
    })
  })
}

/**
 * Writes characters at cell (x, row). Plain, a space is see-through and the
 * character shows only where no pixel is painted; on a `bg` it covers its cell.
 */
const write = (c: Canvas, x: number, row: number, text: string, color: string, bg?: string) => {
  const line = c.glyphs[row + SKY]

  if (!line) {
    return
  }

  ;[...text].forEach((ch, i) => {
    const at = x + i

    if ((ch !== ' ' || bg !== undefined) && at >= 0 && at < c.width) {
      line[at] = { ch, color, bg }
    }
  })
}

const pick = <T,>(xs: readonly T[], t: number): T => xs[((t % xs.length) + xs.length) % xs.length] as T

/** Back and forth over `span` columns. */
const pingPong = (t: number, span: number) => {
  if (span <= 0) {
    return 0
  }

  const p = t % (span * 2)

  return p < span ? p : span * 2 - p
}

const isGoingRight = (t: number, span: number) => span <= 0 || t % (span * 2) < span

// ---- The rabbit ----

type Ears = 'up' | 'left' | 'right' | 'out' | 'down'
type Eyes = 'open' | 'left' | 'right' | 'closed' | 'happy' | 'wide'
type Feet = 'sit' | 'a' | 'b' | 'tuck'
type Arms = 'down' | 'up' | 'left' | 'right' | 'reach' | 'forward'

// Four rows of long ears above her headband; `left` and `right` lean that ear
// outward, `out` lets both fall apart as she dozes.
const EARS: Record<Exclude<Ears, 'down'>, readonly string[]> = {
  up: ['..F.....F..', '.FPF...FPF.', '.FPF...FPF.', '.FPF...FPF.'],
  left: ['.F......F..', 'FPF....FPF.', 'FPF....FPF.', '.FPF...FPF.'],
  right: ['..F......F.', '.FPF....FPF', '.FPF....FPF', '.FPF...FPF.'],
  out: ['...........', 'FF.......FF', 'FPF.....FPF', '.FPF...FPF.'],
}
// Lop ears hang down beside her face instead, from the headband.
const LOP = ['.FF.....FF.', 'FPF.....FPF', 'FP.......PF', 'FP.......PF', 'FF.......FF']
// The headband, her fringe, the face, and her chin between two locks of hair.
const HEAD = ['..FAFFFAF..', '.TTTTTTTTT.', '.TTSTSTSTT.', '.TSSSSSSST.', '.TBSSSSSBT.', '.tTSSSSSTt.']
// Puffed sleeves, a collar and its ribbon.
const SHOULDERS = '.tAAFaFAAt.'
// The row her gloved hands are on, the apron's bib between them.
const HANDS: Record<Arms, string> = {
  down: '.tVAFFFAVt.',
  up: '.t.AFFFA.t.',
  left: '.VAAFFFAVt.',
  right: '.tVAFFFAAV.',
  // Both hands on their way up and out to her right, then pushed out: see `rabbit`.
  reach: '.tVAFFFAAA.',
  forward: '.tVAFFFAAAA',
}
const SKIRT = ['..AAFFFAA..', '.AAAFFFAAA.']
// White stockings and blue shoes.
const LEGS: Record<Feet, readonly string[]> = {
  sit: ['...F...F...', '...a...a...'],
  a: ['...F...F...', '..a...a....'],
  b: ['...F...F...', '....a...a..'],
  tuck: ['...a...a...'],
}
// Landed from a hop, or sat down: a row shorter, her skirt spread about her.
const SQUASHED = ['.AAAFFFAAA.', 'AAAAFFFAAAA', '...a...a...']

type Pose = {
  x?: number
  /** Pixels off the ground; negative sinks her into it. */
  lift?: number
  isSquashed?: boolean
  /** Pixels her head hangs. */
  nod?: number
  ears?: Ears
  eyes?: Eyes
  feet?: Feet
  arms?: Arms
  /** Her colors, for an outfit of another day. */
  inks?: Record<string, string>
}

// What the stroll is doing this frame; a pose that leaves a part alone follows it.
type Stroll = { dx: number; isMoving: boolean; lift: number; isSquashed: boolean; dir: 1 | -1 }
const STILL: Stroll = { dx: 0, isMoving: false, lift: 0, isSquashed: false, dir: 1 }

type Shot = { c: Canvas; t: number; since: number; width: number; isRoomy: boolean; sky: Sky; weather: Weather; stroll: Stroll }

// The face a scene leaves alone: a look around, a blink or two; on the move
// she looks where she is going.
const faceOf = ({ t, stroll }: Shot): Eyes => {
  if (stroll.isMoving) {
    return t % 20 === 0 ? 'closed' : stroll.dir > 0 ? 'right' : 'left'
  }

  const p = t % 56

  if (p < 30) {
    return p === 12 || p === 26 ? 'closed' : 'open'
  }

  if (p < 36) {
    return 'left'
  }

  if (p < 42) {
    return 'right'
  }

  return p === 48 || p === 50 ? 'closed' : 'open'
}

// An ear flicks now and then.
const earsOf = (t: number): Ears => {
  const p = t % 34

  return p === 15 || p === 16 ? 'right' : p === 29 ? 'left' : 'up'
}

const eyes = (c: Canvas, x: number, y: number, look: Eyes, inks = INKS) => {
  const shift = look === 'left' ? -1 : look === 'right' ? 1 : 0

  for (const at of [x + 3 + shift, x + 7 + shift]) {
    if (look === 'closed') {
      // A line along the foot of her eye's cell, all skin whichever way the cells fall.
      const line = c.glyphs[Math.floor(y / 2) + SKY]

      if (line && at >= 0 && at < c.width) {
        line[at] = { ch: '▂', color: INKS.K!, bg: INKS.S!, isWorn: true }
      }
    } else if (look === 'happy') {
      dot(c, at, y, INKS.K!)
    } else {
      dot(c, at, y, INKS.K!)
      dot(c, at, y + 1, inks.k!)

      if (look === 'wide') {
        dot(c, at, y - 1, INKS.K!)
      }
    }
  }
}

const rabbit = (s: Shot, pose: Pose = {}) => {
  const { c, t, stroll } = s
  const x = pose.x ?? 0
  const lift = pose.lift ?? stroll.lift
  const isSquashed = pose.isSquashed ?? stroll.isSquashed
  // Squashed she is a row shorter, so everything above her skirt comes down one.
  const top = FLOOR - SPRITE_ROWS - lift + (isSquashed ? 1 : 0)
  const head = top + (pose.nod ?? 0)
  const ears = pose.ears ?? earsOf(t)
  const arms = pose.arms ?? 'down'
  const feet = pose.feet ?? (lift > 0 ? 'tuck' : stroll.isMoving ? pick(['a', 'b'] as const, t) : 'sit')
  const inks = pose.inks ?? INKS

  // Her dress first: a nodding head comes down over the collar.
  paint(c, x, top + 10, [SHOULDERS, HANDS[arms], ...(isSquashed ? SQUASHED : [...SKIRT, ...LEGS[feet]])], inks)

  if (!isSquashed) {
    // Lace along her hem, teeth half a pixel wide either side of the apron.
    for (const dx of [1, 2, 3]) {
      split(c, x + dx, top + 13, inks.A!, inks.F!)
      split(c, x + 10 - dx, top + 13, inks.F!, inks.A!)
    }
  }

  if (arms === 'up') {
    paint(c, x, top + 8, ['V.........V', 'V.........V'], inks)
  }

  if (arms === 'reach') {
    // Both arms coming up, the gloves a row below where they will push out.
    paint(c, x + 10, top + 11, ['V', 'V'], inks)
  }

  if (arms === 'forward') {
    // The other arm along the first, both gloves out past her side.
    paint(c, x + 10, top + 10, ['AV', '.V'], inks)
  }

  if (ears !== 'down') {
    paint(c, x, head, EARS[ears], inks)
  }

  paint(c, x, head + 4, HEAD, inks)

  // White diamond earrings on the shadowed hair beside her cheeks; lop ears or a carrot cover them.
  for (const at of [x + 1, x + 9]) {
    const line = c.glyphs[Math.floor((head + 8) / 2) + SKY]

    if (line && at >= 0 && at < c.width) {
      line[at] = { ch: '◆', color: INKS.D!, bg: INKS.t!, isWorn: true }
    }
  }

  eyes(c, x, head + 7, pose.eyes ?? faceOf(s), inks)

  if (ears === 'down') {
    paint(c, x, head + 4, LOP, inks)
  }
}

// A little rabbit, 5 x 7, hopping along the ground.
const LITTLE = ['.F.F.', '.F.F.', '.F.F.', 'FFFFF', 'FKFKF', 'FFPFF', '.F.F.']
const LITTLE_FUR = ['#ffaf5f', '#b9a58f', '#9aa3b2', '#f2b6c6']

const little = (c: Canvas, x: number, fur: number, lift = 0) => {
  paint(c, x, FLOOR - LITTLE.length - lift, LITTLE, { ...INKS, F: pick(LITTLE_FUR, fur) })
}

// ---- Props ----

// What the laptop's screen shows while she types, two lines a frame.
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
// What it shows while nobody types: its maker's name.
// Idle, the screen saver: her own face.
const RESTING = ['     ', '(·ω·)'] as const

/** Her laptop on a low table, a column clear of her; shut, just its lid on the keyboard. */
const laptop = ({ c, isRoomy }: Shot, [top, bottom]: readonly [string, string], ink = GREEN, isShut = false, x = PROP_X) => {
  if (!isRoomy) {
    return
  }

  if (isShut) {
    paint(c, x + 1, 12, ['uuuuuuu'])
  } else {
    paint(c, x + 1, 7, ['UUUUUUU', 'U.....U', 'U.....U', 'U.....U', 'U.....U', 'uuuuuuu'])
    write(c, x + 2, 4, top.padEnd(5), ink, SCREEN)
    write(c, x + 2, 5, bottom.padEnd(5), ink, SCREEN)
  }

  paint(c, x, 13, ['QQQQQQQQQ', 'NNNNNNNNN', '.n.....n.'])
}

export type Sky = 'day' | 'dusk' | 'night'

// Her window. Its skies are drawn in half pixels, two letters to a pixel, a dot
// the sky's own color; each cell of them holds no more than two colors.
const WINDOW = ['FFFFFFFFF', ...Array.from({ length: 7 }, () => 'F.......F'), 'FFFFFFFFF']
const SKIES: Record<Sky, { blank: string; rows: readonly string[] }> = {
  // A sun, and a cloud going by under it.
  day: {
    blank: 'J',
    rows: ['......YYYY....', '.....YYYYYY...', '.....YYYYYY...', '......YYYY....', '..DDDD........', '.DDDDDDDD.....', '..eeeeee......'],
  },
  // The sun going down into the sea, its light on the water.
  dusk: {
    blank: 'Z',
    rows: ['MMMMMMMMMMMMMM', 'ZZZZZZZZZZZZZZ', 'ZZZZZYYYYZZZZZ', 'zzzYYYYYYYYzzz', 'zzYYYYYYYYYYzz', 'mmmzzzzzzzzmmm', 'mmmmmzzzzmmmmm'],
  },
  // A slim crescent, and two stars that twinkle.
  night: {
    blank: 'X',
    rows: ['..............', '....YYYY....D.', '...YYY........', '..YYY.........', '..YYY.....d...', '...YYY........', '....YYYY......'],
  },
}

/** Paints half-pixel `rows` from (x, y): each pair of letters one pixel, split where they differ. */
const fine = (c: Canvas, x: number, y: number, rows: readonly string[], blank: string, inks = INKS) => {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx * 2 < row.length; dx += 1) {
      const [left, right] = [row[dx * 2], row[dx * 2 + 1]].map(one => inks[one === '.' ? blank : one!]!)
      dot(c, x + dx, y + dy, left!)

      if (left !== right) {
        split(c, x + dx, y + dy, left!, right!)
      }
    }
  })
}

// The hours her sky turns: day at six, dusk at five in the afternoon, night at seven.
const DAWN = 6
const DUSK_HOUR = 17
const NIGHTFALL = 19

/** The sky where she is at `ms` on the clock. */
export const skyAt = (ms: number): Sky => {
  const hour = new Date(ms).getHours()

  return hour < DAWN || hour >= NIGHTFALL ? 'night' : hour >= DUSK_HOUR ? 'dusk' : 'day'
}

// A star's colors as it twinkles: bright, warm, cool, dim.
const TWINKLE = ['#ffffff', '#fff1a8', '#b8d8ff', '#56648a']

// Rain at her window, by the time of day: the sky behind it, its clouds, the
// rain, and, in a storm, the sky lit and the bolt.
const RAINY: Record<Sky, { sky: string; cloud: string; rain: string; flash: string }> = {
  day: { sky: '#8fa3b8', cloud: '#c9d1db', rain: '#e8f2ff', flash: '#e9eef7' },
  // The day's rain, darkened and warmed a little.
  dusk: { sky: '#6f6070', cloud: '#9a8d98', rain: '#d9cfe0', flash: '#cfc4d8' },
  night: { sky: '#141b2b', cloud: '#2f3850', rain: '#8aa4c8', flash: '#5a6a8a' },
}
const BOLT = '#fff6a0'
// The bolt's half-pixel column on each row below the clouds, zigzagging down.
const ZIGZAG = [9, 7, 8, 6, 5]
// In a storm the bolt strikes on one frame in this many.
const STRIKE_EVERY = 7

/** Rows of half pixels for a rainy window: clouds along the top, streaks falling slantwise below. */
const rainRows = (t: number, isStrike: boolean): string[] => [
  'C'.repeat(14),
  isStrike ? 'W'.repeat(9) + 'L' + 'W'.repeat(4) : 'CC.CCC..CCCC.C',
  ...ZIGZAG.map((bolt, i) =>
    Array.from({ length: 14 }, (_, at) => {
      if (isStrike) {
        return at === bolt ? 'L' : 'W'
      }

      // Below the clouds' ragged edge the sky shows clear for a row, then rain.
      return i >= 1 && (at + 2 * i + 2 * t) % 7 === 0 ? 'r' : '.'
    }).join(''),
  ),
]

const view = (c: Canvas, x: number, t: number, sky: Sky, weather: Weather = 'clear') => {
  if (weather !== 'clear') {
    const colors = RAINY[sky]
    paint(c, x, 0, WINDOW.map(row => row.replaceAll('.', 'X')), { ...INKS, X: colors.sky })
    const isStrike = weather === 'storm' && t % STRIKE_EVERY === 0
    fine(c, x + 1, 1, rainRows(t, isStrike), 'X', { ...INKS, X: colors.sky, C: colors.cloud, r: colors.rain, W: colors.flash, L: BOLT })

    return
  }

  const { blank, rows } = SKIES[sky]
  paint(c, x, 0, WINDOW.map(row => row.replaceAll('.', blank)))
  fine(c, x + 1, 1, rows, blank, sky === 'night' ? { ...INKS, D: pick(TWINKLE, t), d: pick(TWINKLE, t + 2) } : INKS)
}

const CARROT = ['.g.', 'GgG', 'OOO', 'OOO', 'oOo', '.O.', '.o.']

/** A patch of soil along the ground from `x`. */
const soil = (c: Canvas, x: number, columns: number) => {
  for (let i = 0; i < columns; i += 1) {
    dot(c, x + i, 14, (i * 5) % 3 === 0 ? INKS.n! : INKS.N!)
    dot(c, x + i, 15, (i * 7) % 4 === 0 ? INKS.N! : INKS.n!)
  }
}

// ---- Scenes ----

type Scene = {
  draw: (s: Shot) => void
  /** Columns she and what she carries take: given, the frame strolls the stage. */
  strolls?: number
  /** Whether the scene lays itself out over the whole stage instead of being centered. */
  isWide?: boolean
}

// Hopping along: up, over, down, land.
const HOP = [0, 1, 2, 1] as const

// ---- Set pieces ----

/** Whitens every pixel already painted in her columns from row `from` up to `to`: her silhouette in a burst of light. */
const bleach = (c: Canvas, x: number, from: number, to: number) => {
  for (let y = from; y < to; y += 1) {
    const line = c.px[y + SKY * 2]
    const worn = c.glyphs[Math.floor(y / 2) + SKY]

    for (let at = Math.max(0, x); at < Math.min(c.width, x + SPRITE); at += 1) {
      if (line?.[at] !== undefined) {
        line[at] = '#ffffff'
        c.halves[y + SKY * 2]![at] = undefined
      }

      if (worn?.[at]?.isWorn) {
        worn[at] = undefined
      }
    }
  }
}

// Two ribbons, pink and blue, a few pixels long, circling her.
const RIBBONS = ['#ff8fc8', '#7fc8ff']

const ribbons = (c: Canvas, x: number, y: number, t: number, radius = 6) => {
  RIBBONS.forEach((color, i) => {
    for (let k = 0; k < 4; k += 1) {
      const angle = t * 0.7 - k * 0.35 + i * Math.PI
      dot(c, x + 5 + Math.round(Math.cos(angle) * radius), y + Math.round(Math.sin(angle) * (radius + 1)), color)
    }
  })
}

/** Wraps ribbon about her at rows `band - 2` to `band`: stripes running round her, loops out at her side. */
const wrap = (c: Canvas, x: number, band: number, t: number) => {
  for (let y = band - 2; y <= band; y += 1) {
    for (let at = x; at < x + SPRITE; at += 1) {
      dot(c, at, y, (at + y + t) % 4 < 2 ? RIBBONS[0]! : RIBBONS[1]!)
    }
  }

  // Its loose ends, fluttering.
  dot(c, x + SPRITE, band - 1 - (t % 2), RIBBONS[0]!)
  dot(c, x + SPRITE + 1, band - 2 + (t % 2), RIBBONS[1]!)
}

/** Her maid's colors above row `from`, over a figure drawn in other colors below it. */
const above = (s: Shot, pose: Pose, from: number) => {
  const maid = canvasOf(s.c.width)
  rabbit({ ...s, c: maid }, pose)

  for (let y = -SKY * 2; y < from; y += 1) {
    s.c.px[y + SKY * 2] = [...maid.px[y + SKY * 2]!]
    s.c.halves[y + SKY * 2] = [...maid.halves[y + SKY * 2]!]
  }
}

// Her magical girl's colors: hair of pink and lilac, a rose dress with gold, white gloves.
const MAGICAL = {
  ...INKS,
  T: '#ffc8e6',
  t: '#d98fc4',
  A: '#ff5fae',
  a: '#ffcf3f',
  V: '#ffffff',
  k: '#ff5fa8',
}

// Where the sparkles of her pose land, in turn.
const BURST: readonly (readonly [number, number, string, string])[] = [
  [18, 0, '✦', YELLOW],
  [17, 3, '♡', PINK],
  [19, 1, '✧', MAGENTA],
  [18, 5, '♡', MAGENTA],
  [13, 6, '✦', YELLOW],
  [19, 6, '✧', PINK],
]

// Her wands, each from her raised right hand up and out, drawn from column 10 and
// the given row below the top of her sprite; `g` glints. One is hers each time.
const WANDS: readonly { dy: number; rows: readonly string[]; inks: Record<string, string> }[] = [
  // A carrot, its leaves at the top.
  { dy: 2, rows: ['.....GG', '....GG.', '...OO..', '..Oo...', '.oO....', '.O.....'], inks: { ...INKS, G: GREEN } },
  // A little rabbit's head, its nose a gem, on a pink stick.
  { dy: 1, rows: ['...F.F.', '...P.P.', '...F.F.', '..FFFFF', '..FKFKF', '..FFgFF', '.A.....'], inks: MAGICAL },
  // A leek, as a certain singer carries: white where she holds it, its leaves split at the top.
  {
    dy: 0,
    rows: ['......G.G', '......GG.', '.....GG..', '....eG...', '...We....', '..WW.....', '.WW......', 'W........'],
    inks: { ...INKS, G: '#4cbf5a', e: '#b8f0a0', W: '#ffffff' },
  },
]

const BEAM = '#ff6fd8'
const GLOW = '#ff9fe8'
// The beam's middle, between the rows of her pushed-out hands; how far it spreads
// either side, and how fast with distance.
const BEAM_AXIS = 10.5
const BEAM_HALF = 5
const BEAM_SPREAD = 0.3
// Its rim's colors as it shimmers.
const RIM = ['#ff6fd8', '#c77dff', '#7fc8ff', '#ff9fe8']
// Its frames: fired, at full power from the third until FULL, half until HALF, a thread until SPENT.
const FULL = 27
const HALF = 30
const SPENT = 32
const HEART = ['.H.H.', 'HHHHH', 'HHHHH', '.HHH.', '..H..']

// ---- Boot screens ----

// A 3 x 5 pixel font for the logo.
const FONT: Record<string, readonly string[]> = {
  U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
  S: ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  A: ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'],
  G: ['XXX', 'X..', 'X.X', 'X.X', 'XXX'],
  I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
}
const LOGO = 'USAGI'
const logoRows = () =>
  Array.from({ length: 5 }, (_, r) => [...LOGO].map(ch => FONT[ch]![r]).join('.'))

/** Her pixels as they would be drawn standing at x: where each goes and its color. */
const pixelsOf = (s: Shot, pose: Pose) => {
  const temp = canvasOf(s.c.width)
  rabbit({ ...s, c: temp }, pose)
  const out: { x: number; y: number; color: string }[] = []
  temp.px.forEach((line, row) => line.forEach((color, x) => color !== undefined && out.push({ x, y: row - SKY * 2, color })))
  return out
}

// Her little head, for logos.
const BADGE = ['.F.F.', '.P.P.', 'FFFFF', 'FKFKF', 'FFPFF']
// Playing cards, thrown from the hole: where each flies and how it looks.
const CARDS: readonly (readonly [number, string, string])[] = [[-1, '♠', '#ffffff'], [1, '♥', RED], [-3, '♦', RED], [3, '♣', '#ffffff']]
// A gentleman's top hat, banded in pink.
const HAT = ['.KKK.', '.KKK.', '.PPP.', 'KKKKK']
const HAT_INKS = { ...INKS, K: '#6a5a9a', P: '#ff8fc8' }

const hash = (n: number) => ((n * 2654435761) >>> 0) % 1000 / 1000

// ---- Parodies ----

const DITTO = { D: '#c39ae6', d: '#9a6fc4', K: '#2a2530' }
const BLOB = ['....DDD....', '..DDDDDDD..', '.DDDDDDDDD.', '.DDKDDDKDD.', 'DDDDDDDDDDD', 'DDDKKKKKDDD', 'dDDDDDDDDDd']

/** Moves pixels from one place to another, each on its own clock: 0 at `from`, 1 at `to`. */
const morph = (c: Canvas, from: readonly { x: number; y: number }[], to: readonly { x: number; y: number; color: string }[], t: number, color: string) => {
  to.forEach((one, i) => {
    const start = from[i % from.length]!
    const k = Math.min(1, Math.max(0, t * 1.4 - hash(i) * 0.4))
    dot(c, Math.round(start.x + (one.x - start.x) * k), Math.round(start.y + (one.y - start.y) * k), k < 1 ? color : one.color)
  })
}

const pointsOf = (x: number, y: number, rows: readonly string[], inks: Record<string, string>) =>
  rows.flatMap((row, dy) => [...row].flatMap((k, dx) => (inks[k] ? [{ x: x + dx, y: y + dy, color: inks[k]! }] : [])))

// Its usual disguise, a plush yellow electric mouse with a face drawn on by hand.
const PIKA = [
  '.K.....K...',
  '.Y.....Y...',
  '.YY...YY...',
  '..YYYYY....',
  '.YYYYYYY...',
  '.YKYYYKY...',
  '.RYYYYYR...',
  '.YYKYKYY...',
  '..YYYYY....',
  '.yYYYYYy...',
  '.yYYYYYYy..',
  'yYYYYYYYY.K',
  'yYYYYYYYYKK',
  'yyYYYYYYy.K',
  '.sssesesss.',
  '.y.y.y.y.y.',
]
const PIKA_INKS = { Y: '#f2d24b', y: '#c4a53a', K: '#2a2530', R: '#e8604a', s: '#2a1f18', e: '#fff3b0' }
// What it is under the cloth: a shadow with two bright eyes.
const SHADOW = ['...sssss...', '..sssssss..', '.sssesesss.', '.sssssssss.', '..sssssss..', '.s.s.s.s.s.']
const SHADOW_INKS = { s: '#1a1210', e: '#fff3b0' }

// A hand-made disguise of her: cloth ears, one bent over, hair and dress in duller
// cloth, a face stitched on, a ragged hem with a dark gap under it, and a tail.
const MIMIC = [
  '.F......F..',
  '.FP....PF..',
  '.FP...FP...',
  '..F..FF....',
  '..TTTTTTT..',
  '.TTTTTTTTT.',
  '.TSKSSSKST.',
  '.TBSSSSSBT.',
  '..TSKSKST..',
  '.AAAFFFAA..',
  '.AAAFFFAAA.',
  'AAAAFFFAA.K',
  'AAAAFFFAAKK',
  'aAAAFFFAa.K',
  '.sssesesss.',
  '.a.a.a.a.a.',
]
const MIMIC_INKS = {
  F: '#e6e1d6',
  P: '#e6a0b0',
  T: '#b8c2dc',
  S: '#f3e2d2',
  K: '#2a2530',
  B: '#ef9aa8',
  A: '#6f93d6',
  a: '#4f6fb0',
  s: '#1a1210',
  e: '#fff3b0',
}

// Her costumes, as colors for her sprite.
const MIKU = { ...INKS, T: '#39c5bb', t: '#1f8f88', A: '#3a3f4a', a: '#39c5bb', F: '#d8dce2', V: '#3a3f4a', k: '#39c5bb' }
const AQUA = { ...INKS, T: '#8fd0ff', t: '#4a9ad8', A: '#3a7fd8', a: '#8fd0ff', V: '#ffffff' }
const LEEK = WANDS[2]!

// Her dressed as the clown, 15 wide and the stage's full 18 tall, in three poses.
const CLOWN_W = 15
const CLOWN_HEAD = [
  '.....F...F.....',
  '....FP...PF....',
  '....FP...PF....',
  '...RRRRRRRRR...',
  '..RRRRRRRRRRR..',
  '.RRRRRRRRRRRRR.',
  '.RRWWWWWWWWWRR.',
  '.RRWWKWWWKWWRR.',
  '.RRWBWWWWWBWRR.',
  '..RRWWWWWWWRR..',
]
const CLOWN_LEGS = ['....YYYYYYY....', '.....YY.YY.....', '.....RW.WR.....', '....RRR.RRR....']
const CLOWN: Record<'cross' | 'open' | 'up', readonly string[]> = {
  // Arms crossed on her chest, a glove on each shoulder.
  cross: [...CLOWN_HEAD, '...ggYYYYYgg...', '....RWYYYWR....', '....YRWYWRY....', '....RWYYYWR....', ...CLOWN_LEGS],
  // Hands open by her chin, palms up, forearms down to her sides.
  open: [
    ...CLOWN_HEAD.slice(0, 7),
    'gRRWWKWWWKWWRRg',
    'ggRWBWWWWWBWRgg',
    '.RRRWWWWWWWRRR.',
    '.W..YYYYYYY..W.',
    '.R..YYYYYYY..R.',
    '..WRYYYYYYYRW..',
    '....YYYYYYY....',
    ...CLOWN_LEGS,
  ],
  // Both arms thrust straight up, striped, the gloves up past her ears.
  up: [
    '.g...F...F...g.',
    '.g..FP...PF..g.',
    '.R..FP...PF..R.',
    '.W.RRRRRRRRR.W.',
    '.RRRRRRRRRRRRR.',
    '.WRRRRRRRRRRRW.',
    '.RRWWWWWWWWWRR.',
    '.WRWWKWWWKWWRW.',
    '.RRWBWWWWWBWRR.',
    '.WRRWWWWWWWRRW.',
    '.RYYYYYYYYYYYR.',
    '....YYYYYYY....',
    '....YYYYYYY....',
    '....YYYYYYY....',
    ...CLOWN_LEGS,
  ],
}
const CLOWN_INKS = { F: '#f6f4ef', P: '#ff9db0', R: '#e8402e', W: '#ffffff', Y: '#ffd23f', g: '#ffe680', K: '#2a2530', B: '#ffb0b8' }

// A visit: a visitor bounces in from the right, she starts, and she hops away
// into the left corner to peek, leaving it the stage. CORNER is where she peeks
// from, most of her off the stage.
const ARRIVE = 10
const STEP_ASIDE = 16
const CORNER = -6

/** Draws her through a visit: beside it, startled, stepping aside, then peeking from the corner. */
const visited = (s: Shot, peek: { eyes?: Eyes; startle?: boolean; faint?: boolean } = {}) => {
  const p = s.since
  const left = Math.max(0, Math.floor((s.width - 2 * SPRITE - 1) / 2))

  if (p < ARRIVE) {
    const isStartled = p >= 6
    rabbit(s, { x: left, lift: isStartled ? pick([1, 3, 2, 0], p - 6) : 0, isSquashed: false, eyes: isStartled ? 'wide' : 'open', ears: isStartled ? 'out' : 'right', arms: isStartled ? 'up' : 'down', feet: isStartled && p < 9 ? 'tuck' : 'sit' })
    if (isStartled) write(s.c, left + 5, -1, '!', YELLOW)
    return
  }

  if (p < STEP_ASIDE) {
    const k = (p - ARRIVE + 1) / (STEP_ASIDE - ARRIVE)
    rabbit(s, { x: Math.round(left + (CORNER - left) * k), lift: pick([1, 2, 1, 0], p), isSquashed: false, eyes: 'left', ears: 'left', feet: 'tuck' })
    return
  }

  if (peek.faint) {
    // Fainted where she stood, flat out.
    rabbit(s, { x: CORNER, lift: 0, isSquashed: true, nod: 1, eyes: 'closed', ears: 'down' })
    return
  }

  rabbit(s, { x: CORNER, lift: 0, isSquashed: false, eyes: peek.startle ? 'wide' : (peek.eyes ?? 'right'), ears: peek.startle ? 'out' : 'up' })
  if (peek.startle) write(s.c, 0, -1, '!', YELLOW)
}

/** Where a visitor stands: coming in from the right until she starts, then in the middle once she is aside. */
const visitorAt = (s: Shot) => {
  const p = s.since
  const left = Math.max(0, Math.floor((s.width - 2 * SPRITE - 1) / 2))
  const beside = Math.min(s.width - SPRITE, left + SPRITE + 1)
  const middle = Math.floor((s.width - SPRITE) / 2) + 2

  if (p < ARRIVE) return Math.max(beside, s.width - Math.floor(p * 2.2))
  if (p < STEP_ASIDE) return Math.round(beside + (middle - beside) * ((p - ARRIVE + 1) / (STEP_ASIDE - ARRIVE)))
  return middle
}

const SCENES = {
  // A shapeshifter comes to call: she starts and steps aside to the corner, it
  // wobbles, takes her shape with its own dotted face still on, she starts again
  // at the sight of herself, and it goes back to a blob and hops.
  ditto: {
    isWide: true,
    draw: s => {
      const { c } = s
      const p = s.since
      const x = visitorAt(s)
      const q = p - STEP_ASIDE
      visited(s, { startle: q >= 12 && q < 16 })

      if (q < 6) {
        const wide = p % 2 === 0
        paint(c, x + (wide ? 0 : 1), 9 + (wide ? 1 : 0) + (q < 0 ? p % 2 : 0), wide ? BLOB.slice(1) : BLOB.map(row => row.slice(1, 10)), DITTO)
        return
      }

      const blob = pointsOf(x, 9, BLOB, { ...DITTO })
      const her = pixelsOf(s, { x, lift: 0, isSquashed: false, eyes: 'open' })

      if (q < 12) {
        morph(c, blob, her, (q - 5) / 6, DITTO.D)
        return
      }

      if (q < 20) {
        // Her shape, its face: two dots and a line of a smile.
        rabbit(s, { x, lift: 0, isSquashed: false, eyes: 'closed', ears: 'up' })
        const top = FLOOR - SPRITE_ROWS
        paint(c, x + 2, top + 7, ['SSSSSSS', 'SSSSSSS', 'SSSSSSS'])
        dot(c, x + 3, top + 7, DITTO.K)
        dot(c, x + 7, top + 7, DITTO.K)
        paint(c, x + 4, top + 9, ['KKK'], DITTO)
        write(c, x + SPRITE, 1, q % 4 < 2 ? '?' : ' ', YELLOW)
        return
      }

      if (q < 25) {
        morph(c, her, blob, (q - 19) / 5, DITTO.D)
        return
      }

      paint(c, x, 9 - pick([0, 1, 2, 1], q), BLOB, DITTO)
    },
  },

  // A ghost in its usual disguise comes to call: she starts and steps aside to
  // the corner. It looks her over, drops its disguise with a rustle, shadow and
  // eyes, and pulls on a hand-made one of her. It nods hello; its head snaps off
  // with a "poki" and hangs at its side; out of the neck peers a shadow with red
  // eyes, and she faints flat out; a little dark hand puts the head back on; it
  // tilts its head at her, and she comes round with a start.
  mimikyu: {
    isWide: true,
    draw: s => {
      const { c } = s
      const p = s.since
      const q = p - STEP_ASIDE
      const x = visitorAt(s)

      if (q < 12) {
        visited(s, q >= 0 ? { eyes: 'right' } : {})

        if (q < 4) {
          paint(c, x, 0, PIKA, PIKA_INKS)
          if (q >= 0) write(c, x + SPRITE, 1, '?', YELLOW)
          return
        }

        // The old disguise slides off it, the new one comes down over it.
        paint(c, x, 10, SHADOW, SHADOW_INKS)

        if (q < 8) {
          paint(c, x, (q - 3) * 4, PIKA, PIKA_INKS)
          write(c, x + SPRITE, 2, q % 2 ? '~ ~' : ' ~ ~', '#ffffff')
        } else {
          paint(c, x, 0, MIMIC.slice(MIMIC.length - (q - 7) * 4), MIMIC_INKS)
        }

        return
      }

      const r = q - 12
      const isOff = r >= 7 && r < 18
      const fainted = r >= 11 && r < 24
      visited(s, fainted ? { faint: true } : r >= 24 ? { startle: r < 28 } : {})
      // The head: nodding hello, then hanging at its side, then back on.
      const nod = r < 6 ? r % 2 : 0
      const [dx, dy] = isOff ? [4, 6] : r === 6 ? [2, 2] : r >= 18 && r < 22 ? [Math.max(0, 22 - r - 1), Math.max(0, 22 - r - 1)] : [0, nod]

      paint(c, x, 9, MIMIC.slice(9), MIMIC_INKS)

      if (isOff) {
        // The neck open, a shadow in it, two red eyes.
        paint(c, x + 2, 8, ['sssss', 'srsrs', 'sssss'], { s: '#1a1210', r: r % 2 ? '#ff3030' : '#ff8080' })
      }

      paint(c, x + dx, dy, MIMIC.slice(0, 9), MIMIC_INKS)

      if (r >= 6 && r < 10) write(c, x + SPRITE, 0, 'POKI!', '#ffffff')
      if (r >= 11 && r < 15) write(c, 0, 3, 'x_x', '#ffffff')

      if (r >= 18 && r < 22) {
        // A small dark hand, putting it back.
        paint(c, x + 9, 6 - (r % 2), ['.K', 'KK', '.K'], MIMIC_INKS)
        write(c, x + SPRITE + 1, 2, '…', '#ffffff')
      }

      if (r < 6) write(c, x + SPRITE, 1, r % 2 ? '♪' : ' ', YELLOW)
      if (r >= 22) write(c, x + SPRITE, 1, '?', YELLOW)
    },
  },

  // Happy, she can't help it: dressed up as a certain clown, red afro, white
  // face, yellow suit, striped socks, big red shoes, her ears through the afro:
  // "ran" with arms crossed on her chest, "ran" with her hands open by her chin,
  // and "ruu" with both arms thrust straight up; twice.
  ranranru: {
    isWide: true,
    draw: s => {
      const { c, width } = s
      const p = s.since
      const x = Math.floor((width - CLOWN_W) / 2) - 2
      // Per round: crossed 0-3, open 4-5, up 6-13; two rounds, the second held.
      const round = p < 14 ? p : p - 14
      const pose = round < 4 ? 'cross' : round < 6 ? 'open' : 'up'
      const lift = pose === 'up' ? pick([1, 2, 2, 1, 1, 1, 1, 1], round - 6) : 0
      paint(c, x, -2 - lift, CLOWN[pose], CLOWN_INKS)

      // The chant, a word a pose, down the side.
      const said = pose === 'cross' ? 1 : pose === 'open' ? 2 : 3
      ;['RAN', 'RAN', 'RU!'].slice(0, said).forEach((word, i) => write(c, x + CLOWN_W + 1, 2 + i, word, i === 2 ? YELLOW : '#ffffff'))
      if (pose === 'up') write(c, x + CLOWN_W + 1, 1, p % 2 ? '☆' : '★', YELLOW)
    },
  },

  // Dressed as a certain teal-haired singer, twin tails swinging, she swings her
  // leek to a polka.
  miku: {
    isWide: true,
    draw: s => {
      const { c, width } = s
      const p = s.since
      const x0 = Math.floor((width - SPRITE) / 2) - 2
      const sway = pick([0, 1, 0, -1], Math.floor(p / 2))
      rabbit(s, { x: x0 + sway, lift: p % 4 < 2 ? 0 : 1, isSquashed: false, eyes: p % 8 < 6 ? 'happy' : 'open', ears: p % 4 < 2 ? 'left' : 'right', arms: 'up', inks: MIKU })
      const top = FLOOR - SPRITE_ROWS - (p % 4 < 2 ? 0 : 1)

      // Twin tails from her hair ties to her ankles, swinging opposite her.
      for (let y = top + 5; y < FLOOR; y += 1) {
        const out = Math.min(2, Math.floor((y - top - 5) / 3)) * (sway >= 0 ? 1 : 0) + 1
        dot(c, x0 + sway - out, y, y % 3 ? MIKU.T : MIKU.t)
        dot(c, x0 + sway + SPRITE - 1 + out, y, y % 3 ? MIKU.T : MIKU.t)
      }

      // The leek, up and then down, to the beat.
      const leek = p % 4 < 2 ? LEEK.rows : [...LEEK.rows].reverse()
      paint(c, x0 + sway + 10, top + (p % 4 < 2 ? 0 : 8), leek, LEEK.inks)
      write(c, x0 + sway + SPRITE + 5, 3 - (p % 6 < 3 ? 0 : 1), pick(['♪', '♫'], Math.floor(p / 3)), '#39c5bb')
    },
  },

  // Dressed as a certain watery goddess, she raises an open fan and a fountain
  // springs from it, arcing down either side; it gets away from her, and she
  // sits down and bawls.
  aqua: {
    isWide: true,
    draw: s => {
      const { c, width } = s
      const p = s.since
      const x0 = Math.floor((width - SPRITE) / 2) - 2
      const water = '#5fb4ff'
      const isCrying = p >= 18
      rabbit(s, { x: x0, lift: 0, isSquashed: isCrying, eyes: isCrying ? 'closed' : 'happy', ears: isCrying ? 'down' : 'up', arms: isCrying ? 'down' : 'up', inks: AQUA })
      const top = FLOOR - SPRITE_ROWS + (isCrying ? 1 : 0)
      // Her hair in a loop on top.
      paint(c, x0 + 4, top + 2, ['.T.', 'T.T'], AQUA)

      if (!isCrying) {
        // An open folding fan held up in her right hand: ribs pink and white, a handle below.
        // A big folding fan, wide at the top and gathered to its rivet, past her
        // ear on her right, its handle down to her raised hand.
        paint(c, x0 + 10, top + 3, ['PWPWPWP', '.PWPWP.', '..PWP..', '...h...', '..h....', '.h.....'], { P: '#ff7fb8', W: '#ffffff', h: '#c8a070' })
      }

      const jet = x0 + 13
      if (p >= 3 && p < 13) {
        // The fountain: a jet straight up from the fan, falling away to both sides.
        const height = Math.min(top + 3 + 2, (p - 2) * 3)
        for (let k = 0; k < height; k += 1) dot(c, jet, top + 2 - k, (k + p) % 3 ? water : '#ffffff')
        if (p >= 6) {
          for (const side of [-1, 1]) {
            for (let d = 1; d <= 6; d += 1) {
              const y = -1 + Math.floor((d * d) / 3)
              if ((d + p) % 4 !== 0) dot(c, jet + side * d, y, (d + p) % 3 ? water : '#bfe4ff')
            }
          }
          write(c, jet + 7, 0, p % 2 ? '✦' : '✧', YELLOW)
        }
      }

      if (p >= 13 && p < 18) {
        // Out of hand: water everywhere.
        for (let k = 0; k < 20; k += 1) {
          dot(c, Math.floor(hash(k + p * 31) * width), Math.floor(hash(k * 7 + p) * 16) - 1, k % 3 ? water : '#ffffff')
        }
      }

      if (isCrying) {
        // Tears pouring from both eyes into a spreading puddle.
        for (const ex of [x0 + 3, x0 + 7]) {
          for (let y = top + 8; y < FLOOR; y += 1) {
            dot(c, ex + (ex < x0 + 5 ? -1 : 1) * Math.floor((y - top - 8) / 3), y, (y + p) % 3 ? '#e6f6ff' : '#bfe4ff')
          }
        }
        const pool = Math.min(9, p - 16)
        for (let dx = -pool; dx <= SPRITE + pool - 1; dx += 1) dot(c, x0 + dx, 15, (dx + p) % 2 ? water : '#8fd0ff')
        write(c, x0 + SPRITE + 3, 2, 'T_T', p % 2 ? '#ffffff' : '#8fd0ff')
      }
    },
  },

  // A handheld's boot: the logo slides down under her little head, chimes,
  // scatters, and gathers into her.
  bootHandheld: {
    isWide: true,
    draw: s => {
      const { c, width } = s
      const p = s.since
      const rows = logoRows()
      const lx = Math.floor((width - rows[0]!.length) / 2)
      const x0 = Math.floor((width - SPRITE) / 2)

      if (p < 14) {
        const y = Math.min(6, -5 + Math.round(p * 1.3))
        const color = p >= 10 && p % 2 ? '#ffffff' : '#9cc3f5'
        paint(c, Math.floor((width - 5) / 2), y - 6, BADGE)
        paint(c, lx, y, rows, { X: color })
        if (p >= 10) write(c, lx + rows[0]!.length + 1, Math.floor(y / 2), '♪', YELLOW)
        return
      }

      if (p < 21) {
        const from: { x: number; y: number }[] = []
        rows.forEach((row, r) => [...row].forEach((k, i) => k === 'X' && from.push({ x: lx + i, y: 6 + r })))
        const to = pixelsOf(s, { x: x0, lift: 0, isSquashed: false, eyes: 'closed' })
        const t = (p - 14) / 6
        to.forEach((one, i) => {
          const start = from[i % from.length]!
          const k = Math.min(1, Math.max(0, t * 1.4 - hash(i) * 0.4))
          dot(c, Math.round(start.x + (one.x - start.x) * k), Math.round(start.y + (one.y - start.y) * k), k < 1 ? '#9cc3f5' : one.color)
        })
        return
      }

      rabbit(s, { x: x0, lift: 0, isSquashed: false, eyes: p === 23 ? 'closed' : 'open', ears: p >= 24 && p < 26 ? 'left' : 'up' })
    },
  },

  // A power-on self test in green under her little head, a progress bar, a
  // command typed, the screen cleared a line at a time, and she drops in.
  bootBios: {
    isWide: true,
    draw: s => {
      const { c, width } = s
      const p = s.since
      const x0 = Math.floor((width - SPRITE) / 2)
      const ink = '#5fd75f'
      const lines = ['USAGI BIOS v1.0', 'EARS ......', 'MAID DRESS .', 'CARROT .....']

      if (p < 25) {
        // Cleared from the top, a line each frame, once the command is in.
        const gone = Math.max(0, p - 21)
        if (gone < 1) {
          // After the energy saver's logo: her head in a soft white, a yellow
          // swoosh curving up round its right side, a star at its tip.
          const bx = width - 7
          paint(c, bx - 1, 2, BADGE, { F: '#d8dbe4', P: '#e895a6', K: '#1a1a22' })
          paint(c, bx + 4, 0, ['Y..', '.Y.', '..Y', '..Y', '..Y', '.Y.', 'Y..'], { Y: YELLOW })
          write(c, bx + 3, -1, '✦', YELLOW)
        }

        lines.forEach((line, i) => {
          if (p >= i * 3 && i >= gone) {
            write(c, 1, i - 1, line, i === 0 ? '#ffffff' : ink)
            if (i > 0 && p >= i * 3 + 2) write(c, 1 + line.length + 1, i - 1, 'OK', '#ffffff')
          }
        })
        if (p >= 12 && gone < 5) {
          const done = Math.min(10, (p - 11) * 2)
          write(c, 1, 5, `[${'#'.repeat(done)}${' '.repeat(10 - done)}] ${done * 10}%`, ink)
        }
        const typed = '> boot usagi'.slice(0, Math.max(0, (p - 18) * 4))
        if (gone < 6) write(c, 1, 6, typed + (p % 2 === 0 ? '_' : ' '), ink)
        return
      }

      const lift = p < 30 ? pick([12, 8, 4, 1, 0], p - 25) : 0
      rabbit(s, { x: x0, lift, isSquashed: p === 30, eyes: p < 30 ? 'wide' : 'happy', arms: p >= 31 ? 'up' : 'down', feet: lift > 0 ? 'tuck' : 'sit', ears: p < 30 ? 'up' : 'out' })
    },
  },

  // Out of a rabbit hole: dirt flies, her ears peek and look about, she leaps
  // out with playing cards, a top hat drops onto her head, and she checks her watch.
  bootHole: {
    isWide: true,
    draw: s => {
      const { c, width } = s
      const p = s.since
      const x0 = Math.floor((width - SPRITE) / 2)
      const hole = (open: number) => {
        for (let dx = -open; dx <= open; dx += 1) {
          dot(c, x0 + 5 + dx, 15, Math.abs(dx) === open ? INKS.N! : '#120c08')
          if (Math.abs(dx) < open) dot(c, x0 + 5 + dx, 14, Math.abs(dx) === open - 1 ? INKS.n! : '#120c08')
        }
      }

      if (p < 6) {
        hole(Math.min(6, p + 2))
        for (let k = 0; k < 4; k += 1) {
          const side = k % 2 ? 1 : -1
          dot(c, x0 + 5 + side * (4 + p + k), 13 - Math.max(0, 3 - Math.abs(p - 2)) + k % 2, INKS.N!)
        }
        return
      }

      if (p < 12) {
        rabbit(s, { x: x0, lift: -10, isSquashed: false, ears: pick(['up', 'left', 'up', 'right'] as const, Math.floor((p - 6) / 1.5)) })
        hole(6)
        return
      }

      if (p < 16) {
        rabbit(s, { x: x0, lift: pick([-5, 1, 3, 2], p - 12), isSquashed: false, arms: 'up', eyes: 'happy', ears: 'left', feet: 'tuck' })
        hole(p < 14 ? 6 : 4)
      } else {
        if (p < 18) hole(18 - p)
        rabbit(s, { x: x0, lift: 0, isSquashed: p === 16, eyes: p >= 25 ? 'right' : 'happy', arms: p >= 25 ? 'right' : 'down' })
      }

      // Cards thrown up out of the hole as she leaps, falling away.
      if (p >= 12 && p < 22) {
        CARDS.forEach(([dx, ch, color], i) => {
          const up = p - 12
          const y = 6 - up + Math.floor((up * up) / 6) + (i % 2)
          write(c, x0 + 5 + Math.sign(dx) * (5 + Math.abs(dx) + up), y, ch, color)
        })
      }

      // A top hat, dropped onto her head.
      if (p >= 18) {
        const head = FLOOR - SPRITE_ROWS
        paint(c, x0 + 3, Math.min(head, head - 12 + (p - 18) * 3), HAT, HAT_INKS)
      }

      // And her pocket watch, ticking.
      if (p >= 25) {
        const top = FLOOR - SPRITE_ROWS
        paint(c, x0 + 10, top + 10, ['.Y.', 'YwY', '.Y.'], { ...INKS, Y: YELLOW, w: p % 2 ? '#ffffff' : '#ffe9a0' })
        if (p % 4 < 2) write(c, x0 + 13, Math.floor((top + 9) / 2), '♪', '#ffffff')
      }
    },
  },

  // A summoning: two circles drawn turning opposite ways, a pillar of light
  // with motes rising in it, she is scanned in from her ears down, and a ring of
  // gold bursts out as she arrives.
  bootSummon: {
    isWide: true,
    draw: s => {
      const { c, width } = s
      const p = s.since
      const x0 = Math.floor((width - SPRITE) / 2)
      const ring = (rx: number, ry: number, arc: number, turn: number, colors: readonly string[]) => {
        for (let k = 0; k < arc; k += 1) {
          const angle = (k / 24) * Math.PI * 2 + turn
          dot(c, x0 + 5 + Math.round(Math.cos(angle) * rx), 14 + Math.round(Math.sin(angle) * ry), pick(colors, k + p))
        }
      }
      const outer = ['#c77dff', '#ffffff', '#c77dff', '#7fc8ff']
      const inner = ['#ff8fc8', '#ffffff', '#fff3b0']

      ring(9, 1.5, Math.min(24, (p + 1) * 4), p * 0.15, outer)
      if (p >= 3) ring(6, 1, Math.min(24, (p - 2) * 5), -p * 0.25, inner)
      if (p < 7) return

      const top = p < 11 ? 15 - (p - 6) * 4 : -2
      for (let y = Math.max(-2, top); y < 14; y += 1) {
        const edge = pick(['#fff3b0', '#ffffff', '#ffd6f0'], y + p)
        dot(c, x0 - 1, y, edge)
        dot(c, x0 + SPRITE, y, edge)
      }

      // Motes rising in the light.
      for (let k = 0; k < 4; k += 1) {
        const y = 13 - ((p * 2 + k * 5) % 15)
        if (y >= top) dot(c, x0 + 1 + ((k * 3 + p) % 9), y, k % 2 ? '#fff3b0' : '#ffffff')
      }

      if (p >= 11 && p < 23) {
        rabbit(s, { x: x0, lift: 0, isSquashed: false, eyes: 'closed', ears: 'up' })
        const scan = -2 + (p - 10) * 2
        for (let y = Math.max(-2, scan); y < 16; y += 1) {
          for (let at = x0; at < x0 + SPRITE; at += 1) {
            const line = c.px[y + SKY * 2]
            if (line) line[at] = y === scan || y === scan + 1 ? (line[at] === undefined ? undefined : '#ffffff') : undefined
            c.halves[y + SKY * 2]![at] = undefined
          }
        }
        for (let row = Math.floor(scan / 2) + 1; row < 8; row += 1) {
          const line = c.glyphs[row + SKY]
          for (let at = x0; at < x0 + SPRITE; at += 1) if (line?.[at]?.isWorn) line[at] = undefined
        }
      }

      if (p >= 23) {
        rabbit(s, { x: x0, lift: 0, isSquashed: false, eyes: 'happy', ears: p % 4 < 2 ? 'up' : 'out', arms: p < 26 ? 'up' : 'down' })
        // A ring of gold bursting out from her.
        const r = (p - 22) * 3
        for (let k = 0; k < 16; k += 1) {
          const angle = (k * Math.PI) / 8
          dot(c, x0 + 5 + Math.round(Math.cos(angle) * r), 7 + Math.round(Math.sin(angle) * r * 0.7), k % 2 ? YELLOW : '#ffffff')
        }
        write(c, x0 + SPRITE + 2, 1, p % 2 ? '✦' : '✧', YELLOW)
        write(c, x0 - 3, 2, p % 2 ? '✧' : '✦', PINK)
      }

      write(c, x0 + (p % 9), Math.floor(top / 2) + 1, '✧', YELLOW)
    },
  },

  // A loading screen: her pixels fly in one by one as the bar fills; full, it
  // turns her blue, a gleam runs along it, and she opens her eyes.
  bootLoading: {
    isWide: true,
    draw: s => {
      const { c, width } = s
      const p = s.since
      const x0 = Math.max(0, Math.floor((width - SPRITE - 11) / 2))
      const to = pixelsOf(s, { x: x0, lift: 0, isSquashed: false, eyes: p < 22 ? 'closed' : 'open' })
      const order = to.map((one, i) => ({ ...one, at: hash(i * 7 + 3) }))
      const shown = Math.min(1, p / 20)

      order.forEach((one, i) => {
        const k = Math.min(1, Math.max(0, (shown - one.at * 0.85) / 0.15))
        if (k <= 0) return
        const sx = Math.round(hash(i) * (width - 1))
        const sy = Math.round(hash(i + 99) * 17) - 2
        dot(c, Math.round(sx + (one.x - sx) * k), Math.round(sy + (one.y - sy) * k), k < 1 ? '#9cc3f5' : one.color)
      })

      if (p >= 22) rabbit(s, { x: x0, lift: 0, isSquashed: false, eyes: p === 24 ? 'closed' : 'open', ears: p === 22 ? 'left' : 'up' })

      const bx = x0 + SPRITE + 1
      const done = Math.min(8, Math.floor(shown * 8))
      write(c, bx, 2, 'LOADING', '#9cc3f5')

      if (p < 20) {
        write(c, bx, 3, `${'■'.repeat(done)}${'□'.repeat(8 - done)}`, '#ff8fc8')
      } else {
        // Full: her blue, a gleam running along it.
        const gleam = p - 20
        for (let i = 0; i < 8; i += 1) write(c, bx + i, 3, '■', i === gleam ? '#ffffff' : '#9cc3f5')
      }

      write(c, bx, 4, `${Math.round(shown * 100)}%`, '#ffffff')
      if (p >= 20 && p < 24) write(c, bx + 5, 4, '♪', YELLOW)
    },
  },

  // A magical girl's transformation: she leaps with a star raised, flashes with
  // light bursting from her, ribbons circle and close in, then wind up her from
  // her shoes, dressing her anew where they pass; a last flash, and she lands in
  // a pose with her wand.
  transform: {
    draw: s => {
      const { c } = s
      const p = s.since

      if (p < 4) {
        const lift = pick([0, 1, 2, 2], p)
        rabbit(s, { arms: 'up', eyes: 'wide', ears: 'up', lift, isSquashed: false })
        write(c, 10, 2 - Math.floor(lift / 2), '✦', p % 2 ? '#ffffff' : YELLOW)

        return
      }

      const floating = { arms: 'up', eyes: 'closed', ears: 'up', lift: 2, isSquashed: false } as const

      if (p < 7) {
        rabbit(s, floating)

        if (p % 2 === 0) {
          bleach(c, 0, -2, FLOOR)
        }

        // A ring of light, swelling.
        for (let k = 0; k < 10; k += 1) {
          const angle = (k * Math.PI) / 5 + p * 0.2
          const r = (p - 4) * 2 + 4
          dot(c, 5 + Math.round(Math.cos(angle) * r), 6 + Math.round(Math.sin(angle) * r * 0.9), k % 2 ? '#fff3b0' : PINK)
        }

        return
      }

      if (p < 10) {
        rabbit(s, floating)
        ribbons(c, 0, 6, p, 8 - (p - 7) * 2)

        return
      }

      if (p < 22) {
        // Wound from her shoes to her ears in twelve frames, dressed anew below.
        const band = FLOOR - 2 - Math.round(((p - 10) * 18) / 11)
        rabbit(s, { ...floating, inks: MAGICAL })
        above(s, floating, band - 2)
        wrap(c, 0, band, p)
        write(c, pick([1, 9, 4, 7], p), Math.floor((band + 2) / 2) + 1, '✧', YELLOW)

        return
      }

      if (p === 22) {
        rabbit(s, { ...floating, inks: MAGICAL })
        bleach(c, 0, -2, FLOOR)

        return
      }

      // Landed, a gem on her headband and her wand held high, its gem glinting.
      const top = FLOOR - SPRITE_ROWS + (p === 23 ? 1 : 0)
      rabbit(s, { arms: 'up', eyes: 'happy', ears: p % 4 < 2 ? 'up' : 'out', lift: 0, isSquashed: p === 23, inks: MAGICAL })
      dot(c, 5, top + 4, MAGICAL.a)
      // The same wand all through one transformation: chosen by the frame it began on.
      const wand = pick(WANDS, s.t - s.since)
      paint(c, 10, top + wand.dy, wand.rows, { ...wand.inks, g: p % 2 ? '#ffffff' : '#ff4d8d' })
      write(c, 17, Math.floor((top + 1) / 2), p % 4 < 2 ? '✧' : ' ', '#ffffff')

      for (let i = 0; i <= Math.min(BURST.length - 1, p - 23); i += 1) {
        const [x, row, ch, color] = BURST[(i + p) % BURST.length]!
        write(c, x, row, ch, color)
      }
    },
  },

  // Full power: her hands raised and pushed out, a charge gathered before them
  // with her body shaking, a beam across the stage that pushes her back, and smoke.
  blast: {
    isWide: true,
    draw: s => {
      const { c, width } = s
      const p = s.since

      if (p < 10) {
        const x = p >= 6 && p % 2 ? 2 : 1
        const muzzle = x + SPRITE + 1
        // Her hands come up, one and then both, and push out.
        const arms = pick(['down', 'right', 'reach', 'forward'] as const, Math.min(p, 3))
        rabbit(s, { x, arms, eyes: 'wide', ears: 'up', lift: 0, isSquashed: false })

        // Light drawn in from the right, closing on her hands.
        for (let k = 0; k < 4; k += 1) {
          const at = muzzle + Math.max(1, (10 - p) * 2 - k)
          dot(c, at + k * 2, pick([8, 13, 9, 12], k), k % 2 ? GLOW : CYAN)
        }

        // The charge, growing.
        const size = p < 3 ? 0 : p < 6 ? 1 : 2
        for (let dy = -size; dy <= size; dy += 1) {
          for (let dx = -size; dx <= size; dx += 1) {
            if (Math.abs(dx) + Math.abs(dy) <= size + (size > 1 ? 1 : 0)) {
              dot(c, muzzle + dx + size, 11 + dy, Math.abs(dx) + Math.abs(dy) <= size - 1 ? '#ffffff' : BEAM)
            }
          }
        }

        if (p >= 4) {
          // A ring about it, turning.
          for (let k = 0; k < 4; k += 1) {
            const angle = p * 0.8 + (k * Math.PI) / 2
            dot(c, muzzle + size + Math.round(Math.cos(angle) * (size + 2)), 11 + Math.round(Math.sin(angle) * (size + 2)), YELLOW)
          }
        }

        return
      }

      if (p < SPENT) {
        // Pushed back as it fires, then braced, shaking with it at full power.
        const x = p < 12 ? 0 : p < FULL ? 1 + (p % 2) : 1
        const muzzle = x + SPRITE + 1
        rabbit(s, { x, arms: 'forward', eyes: p < 12 ? 'closed' : 'wide', ears: 'left', lift: 0, isSquashed: false })
        // A cone from her hands, widening across the stage: thin as it fires, full
        // in three frames, then fading to a thread.
        const swell = Math.min(1, (p - 9) / 3) * (p < FULL ? 1 : p < HALF ? 0.45 : 0.2)
        const isFull = p >= 12 && p < FULL

        for (let at = muzzle; at < width; at += 1) {
          const half = Math.max(0.5, Math.min(BEAM_HALF, 1 + (at - muzzle) * BEAM_SPREAD) * swell)
          // Rings of light running out along it, and its core pulsing.
          const isRing = isFull && (at - muzzle - p * 2) % 5 === 0
          const core = isFull ? (p % 2 ? 0.55 : 0.35) : 0.45

          for (let y = Math.ceil(BEAM_AXIS - half); y <= Math.floor(BEAM_AXIS + half); y += 1) {
            const off = Math.abs(y - BEAM_AXIS) / half
            const rim = isFull ? pick(RIM, p + at) : (p + at) % 2 ? BEAM : GLOW
            dot(c, at, y, off < core || (isRing && off < 0.8) ? '#ffffff' : off < 0.8 ? GLOW : rim)
          }

          // Sparks thrown off its edges.
          if (isFull && (at * 7 + p * 3) % 6 === 0) {
            const side = (at + p) % 2 ? 1 : -1
            dot(c, at, Math.round(BEAM_AXIS + side * (half + 1 + ((at + p) % 2))), (at + p) % 3 ? YELLOW : '#ffffff')
          }
        }

        if (p === 10) {
          // The flash as it fires: the whole stage lit pink behind her.
          for (const line of c.px) {
            for (let at = 0; at < width; at += 1) {
              line[at] ??= '#ffd6f0'
            }
          }
        }

        return
      }

      rabbit(s, { x: 1, eyes: 'happy', ears: 'up', lift: 0, isSquashed: false })
      // Smoke where it struck, drifting up.
      const rise = Math.floor((p - SPENT) / 2)
      write(c, width - 3, 5 - rise, '∘', GRAY)
      write(c, width - 2, 4 - rise, '○', GRAY)
      write(c, width - 4, 3 - rise, '∘', GRAY)
    },
  },

  // Woken: a jump with her hands up, a curtsy holding out her skirt, and a heart rising beside her.
  welcome: {
    draw: s => {
      const { c } = s
      const p = s.since

      if (p < 4) {
        rabbit(s, { lift: pick([1, 2, 2, 1], p), arms: 'up', eyes: 'wide', ears: 'up', feet: 'tuck', isSquashed: false })
        write(c, SPRITE, 0, '!', YELLOW)

        return
      }

      if (p < 13) {
        rabbit(s, { lift: 0, isSquashed: true, nod: 1, eyes: 'happy', ears: 'out' })
        // Her skirt held out at both sides, its corners lifted now and then.
        const hands = FLOOR - SPRITE_ROWS + 1 + 11
        paint(c, 0, hands, p % 4 < 2 ? ['.tAAFFFAAt.', 'VAAAFFFAAAV'] : ['VtAAFFFAAtV', 'AAAAFFFAAAA'])

        return
      }

      rabbit(s, { lift: 0, isSquashed: false, eyes: 'happy', ears: 'up' })
      paint(c, SPRITE + 1, Math.max(0, 9 - (p - 13)), HEART)
    },
  },

  sleep: {
    isWide: true,
    draw: s => {
      // The clock runs slow while she sleeps: one breath every few seconds.
      // Sat down, her head nodding with it. Her window is on her left where the
      // stage has room for it, else up over her table.
      const pane = WINDOW[0]!.length + 1
      const hasRoom = s.width >= ROOMY + pane
      const centered = Math.floor((s.width - (s.isRoomy ? ROOMY : SPRITE)) / 2)
      // Over her table the window takes from a column past its edge; she moves over for it.
      const overTable = s.width - PROP_X - pane - 1
      const x = hasRoom ? Math.floor((s.width - ROOMY - pane) / 2) + pane : s.isRoomy ? Math.max(0, Math.min(centered, overTable)) : centered
      rabbit(s, { x, ears: 'out', eyes: 'closed', isSquashed: true, nod: s.t % 4 < 2 ? 1 : 0, lift: 0 })
      laptop(s, RESTING, LAPTOP_COLOR, true, x + PROP_X)

      if (hasRoom || (s.isRoomy && x <= overTable)) {
        view(s.c, hasRoom ? x - pane : x + PROP_X + 2, s.t, s.sky, s.weather)
      }

      const z = s.t % 6
      write(s.c, x + 11, 1, z >= 1 ? 'z' : ' ', GRAY)
      write(s.c, x + 12, 0, z >= 2 ? 'Z' : ' ', GRAY)
      write(s.c, x + 14, -1, z >= 3 ? 'Z' : ' ', GRAY)
    },
  },

  idle: {
    draw: s => {
      rabbit(s)
      laptop(s, RESTING, INKS.C!)
    },
  },

  think: {
    strolls: SPRITE + 4,
    draw: s => {
      rabbit(s)
      const n = Math.floor(s.t / 3) % 6
      write(s.c, 10, 2, n >= 1 ? '·' : ' ', GRAY)
      write(s.c, 11, 1, n >= 2 ? 'o' : ' ', GRAY)
      write(s.c, 12, 0, n >= 3 ? 'O' : ' ', CYAN)
      write(s.c, 14, 0, n === 4 ? '?' : n === 5 ? '!' : ' ', n === 5 ? YELLOW : CYAN)
    },
  },

  type: {
    draw: s => {
      // Her hand taps the keys, a pixel out and back.
      rabbit(s, { eyes: s.t % 24 === 0 ? 'closed' : 'right', arms: s.t % 2 ? 'right' : 'down' })
      laptop(s, pick(SCREENS, Math.floor(s.t / 3)))
    },
  },

  read: {
    draw: s => {
      // Her eyes run along a line, then back to the start of the next.
      const p = s.t % 8
      rabbit(s, { eyes: p < 3 ? 'open' : p === 7 ? 'closed' : 'right' })

      if (!s.isRoomy) {
        return
      }

      // A page turns every couple of seconds: its lines fall elsewhere.
      const isTurned = Math.floor(s.t / 16) % 2 === 1
      const page = isTurned ? ['NssNWWN', 'NWWNssN', 'NssNWWN'] : ['NWWNssN', 'NssNWWN', 'NWWNssN']
      paint(s.c, PROP_X, 6, ['.WW.WW.', 'NWWNWWN', ...page, 'NNNNNNN', '..nNn..', '..nNn..', '..nNn..', '.nnnnn.'])
    },
  },

  write: {
    draw: s => {
      rabbit(s, { eyes: s.t % 20 === 0 ? 'closed' : 'right', arms: s.t % 2 ? 'right' : 'down' })

      if (!s.isRoomy) {
        return
      }

      const { c } = s
      paint(c, PROP_X, 4, Array.from({ length: 10 }, () => 'WWWWWWW'))
      paint(c, PROP_X, 14, ['NNNNNNN', 'n.....n'])
      // Four lines of five, written a pixel a frame, then a fresh sheet.
      const written = Math.min(20, s.t % 26)

      for (let i = 0; i < written; i += 1) {
        dot(c, PROP_X + 1 + (i % 5), 5 + Math.floor(i / 5) * 2, INKS.I!)
      }

      if (written < 20) {
        // The pencil, its point where the next pixel goes.
        dot(c, PROP_X + 1 + (written % 5), 5 + Math.floor(written / 5) * 2, INKS.Y!)
        dot(c, PROP_X + 2 + (written % 5), 4 + Math.floor(written / 5) * 2, INKS.R!)
      }
    },
  },

  web: {
    draw: s => {
      rabbit(s, { eyes: s.t % 24 === 0 ? 'closed' : 'right', ears: s.t % 6 < 2 ? 'right' : 'up' })

      if (!s.isRoomy) {
        return
      }

      const { c, t } = s
      const globe = ['.LLLL.', 'LLLLLL', 'LLLLLL', 'LLLLLL', 'LLLLLL', '.LLLL.']
      paint(c, PROP_X, 6, globe)
      // The land drifts across as the globe turns.
      globe.forEach((row, dy) => {
        ;[...row].forEach((letter, dx) => {
          if (letter === 'L' && ((dx + Math.floor(t / 2)) * 3 + dy * 2) % 7 < 2) {
            dot(c, PROP_X + dx, 6 + dy, INKS.G!)
          }
        })
      })
      paint(c, PROP_X, 12, ['..ww..', '..ww..', '.wwww.', 'wwwwww'])
      write(c, PROP_X + 1, 1, pick(['·   ', '··  ', '··· ', '····', ' ···', '  ··', '   ·'], t), CYAN)
    },
  },

  herd: {
    isWide: true,
    draw: s => {
      // She waves the little ones on; they hop about on her right.
      rabbit(s, { eyes: s.t % 22 === 0 ? 'closed' : 'right', arms: s.t % 8 < 4 ? 'up' : 'right' })
      const span = s.width - SPRITE - LITTLE[0]!.length

      if (span < 0) {
        return
      }

      little(s.c, SPRITE + pingPong(s.t, span), 0, pick(HOP, s.t))

      if (span >= 4) {
        little(s.c, SPRITE + span - pingPong(s.t + 3, span), 1, pick(HOP, s.t + 2))
      }
    },
  },

  juggle: {
    draw: s => {
      const { c, t } = s
      rabbit(s, { lift: 0, isSquashed: false, eyes: pick(['left', 'open', 'right', 'open'] as const, Math.floor(t / 2)), arms: t % 2 ? 'left' : 'right' })
      // Up from her left hand, over her ears, down to the right hand and back across her apron.
      const arc = [[1, 10], [0, 7], [0, 4], [1, 1], [3, -1], [5, -2], [7, -1], [9, 1], [10, 4], [10, 7], [9, 10], [7, 12], [5, 12], [3, 12]] as const

      for (let ball = 0; ball < 3; ball += 1) {
        const [x, y] = pick(arc, t + ball * 5)
        dot(c, x, y, pick([INKS.R!, INKS.Y!, INKS.L!], ball))
      }
    },
  },

  magic: {
    strolls: SPRITE + 3,
    draw: s => {
      rabbit(s, { arms: 'up', ears: 'up', lift: s.stroll.isMoving ? undefined : s.t % 8 < 4 ? 2 : 0 })

      for (let i = 0; i < 6; i += 1) {
        const x = (i * 5 + s.t * 3 + i * i) % (SPRITE + 3)
        const row = (i * 3 + s.t) % STAGE_ROWS
        write(s.c, x, row, pick(['✦', '✧', '·', '*'], s.t + i), pick([MAGENTA, CYAN, YELLOW], i + s.t))
      }
    },
  },

  dig: {
    draw: s => {
      const { c, t } = s
      // Down in her hole, hands going, the dirt landing in a heap.
      rabbit(s, { lift: -2, isSquashed: false, eyes: t % 6 < 4 ? 'happy' : 'open', arms: t % 2 ? 'left' : 'right', feet: 'sit' })
      soil(c, 0, s.isRoomy ? ROOMY : SPRITE)

      if (!s.isRoomy) {
        return
      }

      const heap = Math.floor(t / 8) % 4

      for (let level = 0; level < heap; level += 1) {
        for (let x = PROP_X + 1 + level; x < PROP_X + 6 - level; x += 1) {
          dot(c, x, 13 - level, level % 2 ? INKS.n! : INKS.N!)
        }
      }

      for (let clod = 0; clod < 2; clod += 1) {
        const p = (t + clod * 3) % 6
        dot(c, PROP_X - 1 + p, 12 - pick([0, 3, 5, 6, 5, 3], p), INKS.N!)
      }
    },
  },

  carrot: {
    draw: s => {
      const { c, t } = s
      // Nibbled from the tip, a bite every few frames; then a moment to enjoy it.
      const p = t % 44
      const length = Math.max(0, 6 - Math.floor(p / 6))
      const isDone = length === 0
      rabbit(s, { eyes: isDone ? 'happy' : t % 18 === 0 ? 'closed' : 'open', lift: isDone && p % 4 < 2 ? 1 : 0, isSquashed: false })

      if (isDone) {
        write(c, 10, 2, pick(['♪', ' ', '♪'], Math.floor(t / 2)), YELLOW)

        return
      }

      const chin = FLOOR - SPRITE_ROWS + 9
      // Chewing: the tip works at her lips, a pixel in and out.
      paint(c, 6 - (t % 2), chin,['O'.repeat(length) + 'Gg', 'o'.repeat(length) + 'g'])
    },
  },

  dance: {
    strolls: SPRITE + 3,
    draw: s => {
      const beat = Math.floor(s.t / 2)
      rabbit(s, {
        lift: s.stroll.isMoving ? undefined : beat % 2 ? 2 : 0,
        ears: beat % 4 < 2 ? 'left' : 'right',
        arms: beat % 4 < 2 ? 'left' : 'right',
        eyes: beat % 8 < 5 ? 'happy' : 'open',
      })
      write(s.c, 11, 1, pick(['♪', '♪ ♫', ' ♫', '♫ ♪'], beat), CYAN)
    },
  },

  walk: {
    isWide: true,
    draw: s => {
      // Hops the stage from end to end, looking where she goes.
      const span = Math.max(0, s.width - SPRITE)
      const isRight = isGoingRight(s.t, span)
      rabbit(s, {
        x: pingPong(s.t, span),
        lift: pick(HOP, s.t),
        eyes: s.t % 20 === 0 ? 'closed' : isRight ? 'right' : 'left',
        ears: pick(HOP, s.t) === 2 ? (isRight ? 'left' : 'right') : 'up',
      })
    },
  },

  grow: {
    draw: s => {
      const { c, t } = s
      // A carrot comes up in her patch; pulled, it gets a cheer and she sows another.
      const stage = Math.floor(t / 7) % 6
      const isPulled = stage === 5
      rabbit(s, { eyes: isPulled ? 'happy' : t % 22 === 0 ? 'closed' : 'right', arms: isPulled ? 'up' : 'down', lift: isPulled && t % 4 < 2 ? 2 : 0, isSquashed: false })

      if (!s.isRoomy) {
        return
      }

      const x = PROP_X + 2

      if (isPulled) {
        paint(c, x, 5, CARROT)
        write(c, PROP_X, 1, pick(['✦   ✧', ' ✧ ✦ '], Math.floor(t / 2)), YELLOW)
      } else if (stage > 0) {
        // Only the leaves show, a row more each stage.
        paint(c, x, 14 - stage, ['.g.', 'GgG', '.g.', '.g.'].slice(0, stage))
      } else {
        // Watered first.
        dot(c, x + 1, 9 + (t % 4), INKS.L!)
        dot(c, x, 7 + ((t + 2) % 4), INKS.L!)
      }

      soil(c, PROP_X, 7)

      if (isPulled) {
        paint(c, x, 14, ['nnn'])
      }
    },
  },

  cook: {
    draw: s => {
      const { c, t } = s
      rabbit(s, { eyes: t % 22 === 0 ? 'closed' : 'right', arms: t % 4 < 2 ? 'right' : 'down' })

      if (!s.isRoomy) {
        return
      }

      // Carrot stew: the pieces bob, the fire flickers under the pot.
      paint(c, PROP_X, 9, ['WwwwwwW', 'swwwwws', 'swwwwws', '.swwws.', '..sss..'])
      dot(c, PROP_X + 2, t % 4 < 2 ? 9 : 8, INKS.O!)
      dot(c, PROP_X + 4, t % 4 < 2 ? 8 : 9, INKS.O!)
      paint(c, PROP_X + 1, 14, [pick(['.R.R.', 'R.R.R'], t), pick(['RYRYR', 'YRYRY'], t)])
      // The spoon, from her hand to the pot.
      dot(c, PROP_X - 1, t % 4 < 2 ? 10 : 9, INKS.N!)
      dot(c, PROP_X, t % 4 < 2 ? 9 : 8, INKS.N!)
      dot(c, PROP_X + 1, t % 4 < 2 ? 8 : 7, INKS.N!)
      write(c, PROP_X + 1, 2, pick([' ~  ~', '~  ~ ', ' ~ ~ ', '~ ~  '], Math.floor(t / 2)), GRAY)
    },
  },

  shock: {
    draw: s => {
      // A start: straight up, down with a squash, then all ears.
      const p = s.since
      rabbit(s, {
        lift: pick([1, 2, 1, 0], Math.min(p, 3)),
        isSquashed: p === 3 || p === 4,
        ears: 'up',
        eyes: p < 12 ? 'wide' : pick(['left', 'left', 'right', 'right'] as const, Math.floor(p / 3)),
        feet: p < 3 ? 'tuck' : 'sit',
      })

      if (p % 4 < 3) {
        write(s.c, 10, 1, '!!', RED)
      }
    },
  },

  happy: {
    draw: s => {
      // Two hops for joy, a breath, two more.
      const p = s.since % 12
      const lift = p < 8 ? pick(HOP, p) : 0
      rabbit(s, { lift, isSquashed: p === 8, arms: lift > 0 ? 'up' : 'down', eyes: 'happy', ears: lift === 2 ? 'left' : 'up' })
      const at = Math.floor(s.since / 2)
      write(s.c, pick([0, 10, 5, 12, 1, 11], at), pick([0, 1, 0, 3, 2, 0], at), '✦', GREEN)
      write(s.c, pick([11, 0, 13, 5, 10, 0], at), pick([2, 1, 0, 0, 3, 3], at), '✧', YELLOW)
    },
  },

  sad: {
    draw: s => {
      const { c, t } = s
      rabbit(s, { ears: 'down', eyes: 'closed', lift: 0, isSquashed: true, nod: 1 })
      // A tear down her cheek.
      dot(c, 3, FLOOR - SPRITE_ROWS + 11 + Math.min(2, s.since % 8), INKS.C!)

      if (!s.isRoomy) {
        return
      }

      // And a cloud of her own, raining beside her.
      paint(c, PROP_X, 2, ['..www..', '.wwwww.', 'wwsssww'])

      for (let drop = 0; drop < 3; drop += 1) {
        dot(c, PROP_X + 1 + drop * 2, 6 + ((t + drop * 3) % 9), INKS.L!)
      }
    },
  },

  love: {
    draw: s => {
      const p = s.since
      rabbit(s, { eyes: 'open', lift: p % 8 < 4 ? pick([0, 1, 2, 1], p) : 0, isSquashed: false, ears: p % 8 < 4 ? 'up' : 'left' })
      write(s.c, 10, 3 - (p % 4), '♡', MAGENTA)
      write(s.c, 0, 2 - ((p + 2) % 3), '♡', PINK)
      write(s.c, 12, 2 - ((p + 1) % 3), '♡', RED)
    },
  },
} satisfies Record<string, Scene>

export type SceneName = keyof typeof SCENES
// The boot screens, one of them played as a session starts.
const BOOTS: readonly SceneName[] = ['bootHandheld', 'bootBios', 'bootHole', 'bootSummon', 'bootLoading']
export const SCENE_NAMES = Object.keys(SCENES) as SceneName[]

// Every scene in turn, for the play-all button: the boot screens first, each
// everyday one for three seconds, the set pieces whole, the blast last.
const EVERYDAY = 20
export const REEL: readonly { scene: SceneName; label: string; frames: number }[] = [
  { scene: 'bootHandheld', label: '開機：掌機', frames: 28 },
  { scene: 'bootBios', label: '開機：BIOS', frames: 34 },
  { scene: 'bootHole', label: '開機：兔子洞', frames: 32 },
  { scene: 'bootSummon', label: '開機：召喚', frames: 28 },
  { scene: 'bootLoading', label: '開機：讀取', frames: 28 },
  { scene: 'idle', label: '發呆', frames: EVERYDAY },
  { scene: 'think', label: '思考', frames: EVERYDAY },
  { scene: 'type', label: '打字', frames: EVERYDAY },
  { scene: 'read', label: '看書', frames: EVERYDAY },
  { scene: 'write', label: '寫字', frames: EVERYDAY },
  { scene: 'web', label: '上網', frames: EVERYDAY },
  { scene: 'dig', label: '挖洞', frames: EVERYDAY },
  { scene: 'herd', label: '帶小兔子', frames: EVERYDAY },
  { scene: 'magic', label: '魔法', frames: EVERYDAY },
  { scene: 'juggle', label: '拋接', frames: EVERYDAY },
  { scene: 'carrot', label: '吃紅蘿蔔', frames: EVERYDAY },
  { scene: 'cook', label: '煮東西', frames: EVERYDAY },
  { scene: 'grow', label: '種花', frames: EVERYDAY },
  { scene: 'dance', label: '跳舞', frames: EVERYDAY },
  { scene: 'walk', label: '散步', frames: EVERYDAY },
  { scene: 'shock', label: '收到', frames: EVERYDAY },
  { scene: 'happy', label: '開心', frames: EVERYDAY },
  { scene: 'sad', label: '難過', frames: EVERYDAY },
  { scene: 'love', label: '被摸', frames: EVERYDAY },
  { scene: 'sleep', label: '睡覺', frames: EVERYDAY },
  { scene: 'welcome', label: '歡迎回來', frames: 21 },
  { scene: 'ditto', label: '百變怪', frames: 44 },
  { scene: 'mimikyu', label: '謎擬Q', frames: 58 },
  { scene: 'ranranru', label: '藍藍路', frames: 28 },
  { scene: 'miku', label: '初音 cosplay', frames: 28 },
  { scene: 'aqua', label: '阿克婭 cosplay', frames: 32 },
  { scene: 'transform', label: '變身', frames: 32 },
  { scene: 'blast', label: '全力全開', frames: 42 },
]

/** Where the reel is `frame` frames in: its entry, which, and how far into it; past its end, nothing. */
export const reelAt = (frame: number) => {
  let start = 0

  for (const [index, one] of REEL.entries()) {
    if (frame < start + one.frames) {
      return { ...one, index, since: frame - start }
    }

    start += one.frames
  }

  return undefined
}

// ---- Which scene plays when ----

// A running tool's scene, by tool name; any other tool is typed at the laptop.
const TOOL_SCENES: readonly (readonly [RegExp, SceneName])[] = [
  [/^(Read|NotebookRead|LS)$/, 'read'],
  [/^(Grep|Glob|ToolSearch)$/, 'dig'],
  [/^(Edit|Write|MultiEdit|NotebookEdit)$/, 'write'],
  [/^Web/, 'web'],
  [/^(Agent|Task|SendMessage|Workflow)$/, 'herd'],
  [/^(TodoWrite|Skill)$/, 'juggle'],
  [/^mcp__/, 'magic'],
]

export const sceneForTool = (tool: string): SceneName => TOOL_SCENES.find(([re]) => re.test(tool))?.[1] ?? 'type'

// The spinner's word, by stem, for the scenes she has; the first match wins.
const WORD_SCENES: readonly (readonly [RegExp, SceneName])[] = [
  [/cook|simmer|stew|saut|marinat|flamb|season|garnish|whisk|boil|fry|bak|roast|brew|knead|concoct/, 'cook'],
  [/sprout|germinat|grow|bloom|cultivat|pollinat|photosynth|propagat|unfurl|hatch|incubat/, 'grow'],
  [/burrow|spelunk|dig|excavat|forag|rummag/, 'dig'],
  [/nibbl|munch|chew|snack|noodl|digest|savor/, 'carrot'],
  // Only a word that starts so: "sing" inside Processing is no song.
  [/^(vib|groov|jam|bebop|harmoni|serenad|sing|croon|whistl|humm)/, 'miku'],
  [/boogi|danc|jitterbug|shimm|frolic/, 'dance'],
  [/juggl|shuffl|wrangl|herd|orchestrat/, 'juggle'],
  [/conjur|manifest|transmut|enchant|alchem|metamorph|crystalli|levitat/, 'magic'],
  [/mosey|wander|meander|stroll|perambul|scamper|scurr|gallop|zoom|dash|hop|waddl|dilly|gallivant|schlep/, 'walk'],
  [/sketch|doodl|scribbl|draft|compos|jott/, 'write'],
  [/perus|study|decipher/, 'read'],
]

/** The scene a spinner word names, if she has one for it. */
export const sceneForWord = (word: string): SceneName | undefined => {
  const stem = word.toLowerCase().replace(/[^a-z]/g, '')

  return WORD_SCENES.find(([re]) => re.test(stem))?.[1]
}

// What a long think steps through, an act at a time.
const ROTATION: readonly SceneName[] = ['walk', 'carrot', 'think', 'dance', 'grow', 'cook', 'juggle']
// Coprime with the rotation's length, so every scene comes round.
const ROTATION_STEP = 3

/**
 * The scene for the rabbit as she is. A passing mood has its own; a running tool
 * picks hers while it runs; thinking opens on the spinner's word and, a quarter
 * of a minute into the turn, starts through the rotation from where `seed` puts it.
 */
export const sceneOf = (b: Bunny, word = '', seed = 0): SceneName => {
  switch (b.mood) {
    case 'sleepy':
      return 'sleep'
    case 'boot':
      return pick(BOOTS, seed)
    case 'working':
      return sceneForTool(b.tool)
    case 'thinking': {
      const act = Math.floor(Math.max(0, b.tick - b.turnTick) / ACT_FRAMES)

      return act === 0 ? (sceneForWord(word) ?? 'think') : pick(ROTATION, seed + act * ROTATION_STEP)
    }
    default:
      return b.mood
  }
}

// ---- Drawing a frame ----

const PAUSE = 12 // frames spent at each end of a stroll

/** Where a stroll puts the frame: hop right, wait, hop left, wait; a jump on arriving. */
const strollAt = (t: number, span: number): Stroll => {
  if (span <= 0) {
    return STILL
  }

  const p = t % (2 * (span + PAUSE))
  // Arrived: a jump, a squash on landing, then she stands.
  const arrive = (q: number) => ({ isMoving: false, lift: q === 0 ? 2 : 0, isSquashed: q === 1 || q === 2 })

  if (p < span) {
    return { dx: p, isMoving: true, lift: pick(HOP, p), isSquashed: false, dir: 1 }
  }

  if (p < span + PAUSE) {
    return { dx: span, ...arrive(p - span), dir: 1 }
  }

  if (p < 2 * span + PAUSE) {
    return { dx: 2 * span + PAUSE - p, isMoving: true, lift: pick(HOP, p), isSquashed: false, dir: -1 }
  }

  return { dx: 0, ...arrive(p - 2 * span - PAUSE), dir: -1 }
}

export type Run = { text: string; color?: string; bg?: string }

// A cell is two pixels, one above the other: one colored character for each pair.
const cellOf = (above: string | undefined, below: string | undefined): Glyph => {
  if (above === undefined) {
    return below === undefined ? { ch: ' ' } : { ch: '▄', color: below }
  }

  if (below === undefined) {
    return { ch: '▀', color: above }
  }

  return above === below ? { ch: '█', color: above } : { ch: '▀', color: above, bg: below }
}

// Quadrant characters by which quarters are lit: 1 upper left, 2 upper right, 4 lower left, 8 lower right.
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'

// A cell with a split pixel is four quarters, drawn as a quadrant if two colors cover them.
const quartersOf = (quarters: readonly (string | undefined)[]): Glyph | undefined => {
  const colors = [...new Set(quarters)]
  const color = colors.find(one => one !== undefined)

  if (colors.length > 2 || color === undefined) {
    return undefined
  }

  const lit = quarters.reduce((mask, one, i) => (one === color ? mask | (1 << i) : mask), 0)

  return { ch: QUADRANTS[lit]!, color, bg: colors.find(one => one !== color) }
}

/**
 * One frame of the stage, `STAGE_ROWS` rows of same-colored runs, `width` cells
 * each. `t` is her frame counter, `since` the frames her mood has lasted, and
 * `sky` and `weather` what her window shows.
 */
export const frameRows = (name: SceneName, t: number, width: number, since = t, sky: Sky = 'night', weather: Weather = 'clear'): Run[][] => {
  const columns = Math.max(1, Math.min(Math.floor(width), MAX_STAGE))
  const scene: Scene = SCENES[name]
  const isRoomy = columns >= ROOMY
  const extent = scene.strolls === undefined ? undefined : isRoomy ? scene.strolls : SPRITE
  const stroll = extent === undefined ? STILL : strollAt(t, columns - extent)
  const c = canvasOf(columns)
  scene.draw({ c, t, since, width: columns, isRoomy, sky, weather, stroll })
  // A scene that neither strolls nor fills the stage sits in the middle of it.
  const centered = Math.floor((columns - (isRoomy ? ROOMY : SPRITE)) / 2)
  const dx = scene.isWide ? 0 : extent === undefined ? centered : stroll.dx

  return Array.from({ length: STAGE_ROWS }, (_, row) => {
    const runs: Run[] = []

    for (let x = 0; x < columns; x += 1) {
      const from = x - dx
      const glyph = c.glyphs[row]?.[from]
      const above = c.px[row * 2]?.[from]
      const below = c.px[row * 2 + 1]?.[from]
      const isBare = above === undefined && below === undefined
      const top = c.halves[row * 2]?.[from]
      const bottom = c.halves[row * 2 + 1]?.[from]
      const quarters = top || bottom ? quartersOf([...(top ?? [above, above]), ...(bottom ?? [below, below])]) : undefined
      const cell = glyph && (glyph.bg !== undefined || isBare) ? glyph : (quarters ?? cellOf(above, below))
      // A blank cell carries no color, so blanks run together.
      const color = cell.ch === ' ' ? undefined : cell.color
      const last = runs[runs.length - 1]

      if (last && last.color === color && last.bg === cell.bg) {
        last.text += cell.ch
      } else {
        runs.push({ text: cell.ch, color, bg: cell.bg })
      }
    }

    return runs
  })
}
