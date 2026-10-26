import type { Bunny, Mood } from '../types'
import type { SceneName } from './scenes'

// An idle rabbit dozes off at once: idle is only the moment before sleep.
export const SLEEP_AFTER_MS = 0

// Moods that pass by themselves, and how long each lasts.
const TTL: Partial<Record<Mood, number>> = {
  happy: 6000,
  shock: 3000,
  sad: 5000,
  love: 3000,
  // Set pieces, each as long as its scene.
  transform: 4800,
  blast: 6300,
  welcome: 3000,
  // As long as the longest boot screen; a shorter one holds its last pose.
  boot: 5100,
  // Parodies, each as long as its scene.
  ditto: 6600,
  mimikyu: 8700,
  ranranru: 4200,
  aqua: 4800,
  excalibur: 8400,
  buster: 9600,
  spark: 8400,
  world: 7200,
  lunatic: 8400,
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
  transform: 'magenta',
  blast: 'magenta',
  welcome: 'magenta',
  boot: 'magenta',
  ditto: 'magenta',
  mimikyu: 'magenta',
  ranranru: 'yellow',
  aqua: 'blue',
  excalibur: 'yellow',
  buster: 'cyan',
  spark: 'yellow',
  world: 'blue',
  lunatic: 'magenta',
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

/** Her caption; `scene`, the one drawn, tells the boot screens apart. */
export const captionOf = (b: Bunny, scene?: SceneName): string => {
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
    case 'transform':
      return '變身！'
    case 'blast':
      return '全力全開！'
    case 'welcome':
      return '歡迎回來♡'
    case 'boot':
      // The land of illusions' own loading screen has its own words.
      return scene === 'bootPray' ? (b.tick - b.moodTick < 24 ? '少女祈禱中…' : '祈禱完成！') : '兔兔 啟動！'
    case 'ditto':
      return '有兩個兔兔？'
    case 'mimikyu':
      return '咦…是誰？'
    case 'ranranru':
      return '藍藍路☆'
    case 'aqua':
      return '嗚哇——'
    case 'excalibur': {
      // The wind, the blade let loose, the light, then her supper.
      const p = b.tick - b.moodTick

      return p < 8 ? '風王結界…' : p < 26 ? '解放——' : p < 40 ? 'EX咖哩棒！' : '再來一碗！'
    }
    case 'buster': {
      // Ready, the charge, the shot and its bounce, the volley, and done.
      const p = b.tick - b.moodTick

      return p < 16 ? 'READY…' : p < 28 ? '集氣中…' : p < 34 ? '兔兔飛彈！' : p < 40 ? '欸？' : p < 52 ? '連射！' : '任務完成！'
    }
    case 'spark': {
      // Her arrival, the charge, the beam, the smoke, and the books.
      const p = b.tick - b.moodTick

      return p < 8 ? '普通的魔法使來了' : p < 22 ? '戀符——' : p < 38 ? 'Master Spark！' : p < 46 ? '彈幕就是火力！' : '只是借走而已 DA☆ZE'
    }
    case 'world': {
      // The watch, time stopped, the knives loosed, and tea.
      const p = b.tick - b.moodTick

      return p < 8 ? '女僕長登場' : p < 14 ? '幻世「The World」' : p < 28 ? '（停止的時間裡…）' : p < 34 ? '然後時間開始流動' : '紅茶泡好了，請慢用'
    }
    case 'lunatic': {
      // The moon, her eyes, the illusion, its shots, its end, and rice cake.
      const p = b.tick - b.moodTick

      return p < 8 ? '月兔來了' : p < 14 ? '看著我的眼睛…' : p < 26 ? '幻波「赤眼催眠」' : p < 38 ? '狂氣的彈幕！' : p < 46 ? '…哪個才是真的？' : '還是搗年糕最療癒'
    }
  }
}
