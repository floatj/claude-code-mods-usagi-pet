import type { Bunny } from '../types'

// The rabbit's stage, after clawd-actor's (github.com/BrianHuang813/clawd-actor): a scene
// draws her and her props for one frame, and the frames follow what the turn is doing.
// She is a rabbit-eared maid in blue and white. The stage is a canvas of half-cell
// pixels, two to a cell (▀ ▄ █), so she is painted in several colors and hops a pixel
// at a time.
// Pure functions only, so the frames can be checked without the engine.

export const STAGE_ROWS = 9
export const MAX_STAGE = 26
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
const ROOMY = 18
const PROP_X = SPRITE

/** The white of her ears and apron. */
export const FUR_COLOR = '#f6f4ef'
/** The laptop's own color, apart from the rabbit's. */
export const LAPTOP_COLOR = '#af87ff'

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
  E: '#7a5a50', // a closed eye
  A: '#5b9bf0', // dress
  a: '#3565c0', // ribbon and shoes
  C: '#c8ecff', // a tear
  D: '#ffffff', // diamond earrings
  V: '#a8dcf5', // gloves
  H: '#ff4d6d', // heart
  U: LAPTOP_COLOR,
  u: '#7a5fd0',
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
const split = (c: Canvas, x: number, y: number, left: string, right: string) => {
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
type Eyes = 'open' | 'left' | 'right' | 'closed' | 'happy' | 'wide' | 'heart'
type Feet = 'sit' | 'a' | 'b' | 'tuck'
type Arms = 'down' | 'up' | 'left' | 'right'

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
}

// What the stroll is doing this frame; a pose that leaves a part alone follows it.
type Stroll = { dx: number; isMoving: boolean; lift: number; isSquashed: boolean; dir: 1 | -1 }
const STILL: Stroll = { dx: 0, isMoving: false, lift: 0, isSquashed: false, dir: 1 }

type Shot = { c: Canvas; t: number; since: number; width: number; isRoomy: boolean; stroll: Stroll }

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

const eyes = (c: Canvas, x: number, y: number, look: Eyes) => {
  const shift = look === 'left' ? -1 : look === 'right' ? 1 : 0

  for (const at of [x + 3 + shift, x + 7 + shift]) {
    if (look === 'closed') {
      dot(c, at, y + 1, INKS.E!)
    } else if (look === 'happy') {
      dot(c, at, y, INKS.K!)
    } else if (look === 'heart') {
      dot(c, at, y, INKS.H!)
      dot(c, at, y + 1, INKS.H!)
    } else {
      dot(c, at, y, INKS.K!)
      dot(c, at, y + 1, INKS.k!)

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

  // Her dress first: a nodding head comes down over the collar.
  paint(c, x, top + 10, [SHOULDERS, HANDS[arms], ...(isSquashed ? SQUASHED : [...SKIRT, ...LEGS[feet]])])

  if (!isSquashed) {
    // Lace along her hem, teeth half a pixel wide either side of the apron.
    for (const dx of [1, 2, 3]) {
      split(c, x + dx, top + 13, INKS.A!, INKS.F!)
      split(c, x + 10 - dx, top + 13, INKS.F!, INKS.A!)
    }
  }

  if (arms === 'up') {
    paint(c, x, top + 8, ['V.........V', 'V.........V'])
  }

  if (ears !== 'down') {
    paint(c, x, head, EARS[ears])
  }

  paint(c, x, head + 4, HEAD)

  // White diamond earrings on the shadowed hair beside her cheeks; lop ears or a carrot cover them.
  for (const at of [x + 1, x + 9]) {
    const line = c.glyphs[Math.floor((head + 8) / 2) + SKY]

    if (line && at >= 0 && at < c.width) {
      line[at] = { ch: '◆', color: INKS.D!, bg: INKS.t!, isWorn: true }
    }
  }

  eyes(c, x, head + 7, pose.eyes ?? faceOf(s))

  if (ears === 'down') {
    paint(c, x, head + 4, LOP)
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
const CLOSED = ['NZXT ', '     '] as const

const laptop = ({ c, isRoomy }: Shot, [top, bottom]: readonly [string, string], ink = GREEN) => {
  if (!isRoomy) {
    return
  }

  paint(c, PROP_X, 5, ['UUUUUUU', 'U.....U', 'U.....U', 'U.....U', 'U.....U', 'uuuuuuu'])
  write(c, PROP_X + 1, 3, top.padEnd(5), ink, SCREEN)
  write(c, PROP_X + 1, 4, bottom.padEnd(5), ink, SCREEN)
  // On a desk, the keyboard a cell toward her at the height of her hands.
  paint(c, PROP_X - 1, 11, ['UUUUUUUU', 'NNNNNNNN', '.n....n.', '.n....n.', '.n....n.'])
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

const SCENES = {
  sleep: {
    draw: s => {
      // The clock runs slow while she sleeps: one breath every few seconds.
      // Sat down, her head nodding with it.
      rabbit(s, { ears: 'out', eyes: 'closed', isSquashed: true, nod: s.t % 4 < 2 ? 1 : 0, lift: 0 })
      laptop(s, CLOSED, LAPTOP_COLOR)
      const z = s.t % 6
      write(s.c, 11, 1, z >= 1 ? 'z' : ' ', GRAY)
      write(s.c, 12, 0, z >= 2 ? 'Z' : ' ', GRAY)
      write(s.c, 14, -1, z >= 3 ? 'Z' : ' ', GRAY)
    },
  },

  idle: {
    draw: s => {
      rabbit(s)
      laptop(s, CLOSED, LAPTOP_COLOR)
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
      rabbit(s, { eyes: 'heart', lift: p % 8 < 4 ? pick([0, 1, 2, 1], p) : 0, isSquashed: false, ears: p % 8 < 4 ? 'up' : 'left' })
      write(s.c, 10, 3 - (p % 4), '♡', MAGENTA)
      write(s.c, 0, 2 - ((p + 2) % 3), '♡', PINK)
      write(s.c, 12, 2 - ((p + 1) % 3), '♡', RED)
    },
  },
} satisfies Record<string, Scene>

export type SceneName = keyof typeof SCENES
export const SCENE_NAMES = Object.keys(SCENES) as SceneName[]

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
  [/vib|groov|boogi|danc|jitterbug|shimm|frolic|jam|bebop/, 'dance'],
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
 * each. `t` is her frame counter and `since` the frames her mood has lasted.
 */
export const frameRows = (name: SceneName, t: number, width: number, since = t): Run[][] => {
  const columns = Math.max(1, Math.min(Math.floor(width), MAX_STAGE))
  const scene: Scene = SCENES[name]
  const isRoomy = columns >= ROOMY
  const extent = scene.strolls === undefined ? undefined : isRoomy ? scene.strolls : SPRITE
  const stroll = extent === undefined ? STILL : strollAt(t, columns - extent)
  const c = canvasOf(columns)
  scene.draw({ c, t, since, width: columns, isRoomy, stroll })
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
