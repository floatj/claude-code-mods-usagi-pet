import type { Bunny, Mood } from '../types'

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
  moodTick: 0,
  turnTick: 0,
  tool: '',
  isBusy: false,
  pets: 0,
}

export const setMood = (b: Bunny, mood: Mood, now: number, tool = ''): Bunny =>
  b.mood === mood && b.tool === tool ? b : { ...b, mood, tool, since: now, moodTick: b.tick }

/** One clock period: advance the frame, and let a mood run out. */
export const step = (b: Bunny, now: number): Bunny => {
  // A rabbit kept from before a reload may lack what was added since.
  const next = { ...INITIAL, ...b, tick: b.tick + 1 }
  const age = now - b.since
  const ttl = TTL[b.mood]

  if (ttl !== undefined && age > ttl) {
    return { ...next, mood: b.isBusy ? 'thinking' : 'idle', since: now, moodTick: next.tick }
  }

  if (b.mood === 'idle' && age > SLEEP_AFTER_MS) {
    return { ...next, mood: 'sleepy', since: now, moodTick: next.tick }
  }

  return next
}

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

// Frames each dot of the thinking caption takes to appear.
const DOT_FRAMES = 4

export const captionOf = (b: Bunny): string => {
  switch (b.mood) {
    case 'idle':
      return '發呆中'
    case 'thinking':
      return '思考中' + '.'.repeat((Math.floor(b.tick / DOT_FRAMES) % 3) + 1)
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
