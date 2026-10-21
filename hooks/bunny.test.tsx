import { expect, mock, test } from 'claude-code/testing'

import { INITIAL, setMood, SLEEP_AFTER_MS, step } from './bunny'
import { ACT_FRAMES, FRAME_MS, frameRows, MAX_STAGE, SCENE_NAMES, sceneForTool, sceneForWord, sceneOf, skyAt, STAGE_ROWS } from './scenes'

const PANE = {
  component: 'Pane',
  requestId: 'bunny',
  props: {
    title: '兔兔',
    isFocused: false,
    bodyColumns: 22,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('a passing mood runs out, and a long idle falls asleep', () => {
  const happy = setMood(INITIAL, 'happy', 1000)
  expect(step(happy, 2000).mood).toBe('happy')
  expect(step(happy, 8000).mood).toBe('idle')
  expect(step({ ...happy, isBusy: true }, 8000).mood).toBe('thinking')
  expect(step(INITIAL, SLEEP_AFTER_MS + 1).mood).toBe('sleepy')
  // A passing mood's scene plays from the frame the mood began on.
  expect(setMood({ ...INITIAL, tick: 40 }, 'love', 1000).moodTick).toBe(40)
  expect(step({ ...happy, tick: 9 }, 8000).moodTick).toBe(10)
})

test('every scene fills the stage, whatever its width and frame', () => {
  for (const name of SCENE_NAMES) {
    for (const width of [1, 9, 11, 16, 18, 22, MAX_STAGE, 60]) {
      for (let t = 0; t < 120; t += 1) {
        const rows = frameRows(name, t, width)
        expect(rows).toHaveLength(STAGE_ROWS)

        for (const runs of rows) {
          const cells = runs.reduce((sum, run) => sum + [...run.text].length, 0)
          expect(cells).toBe(Math.min(width, MAX_STAGE))
        }
      }
    }
  }
})

test('she is painted in more colors than her own, and moves from frame to frame', () => {
  const colorsOf = (t: number) => frameRows('type', t, 22).flatMap(runs => runs.flatMap(run => [run.color, run.bg]))
  expect(new Set(colorsOf(0).filter(Boolean)).size).toBeGreaterThan(5)

  for (const name of SCENE_NAMES) {
    const frames = new Set(Array.from({ length: 60 }, (_, t) => JSON.stringify(frameRows(name, t, 22))))
    expect(frames.size).toBeGreaterThan(1)
  }
})

test('her window shows the sun by day, a sunset at dusk and the moon at night', () => {
  const at = (hour: number, minute = 0) => skyAt(new Date(2026, 9, 19, hour, minute).getTime())
  expect([at(5, 59), at(6), at(16, 59), at(17), at(18, 59), at(19), at(3)]).toEqual(['night', 'day', 'day', 'dusk', 'dusk', 'night', 'night'])
  const drawn = (['day', 'dusk', 'night'] as const).map(sky => JSON.stringify(frameRows('sleep', 0, MAX_STAGE, 0, sky)))
  expect(new Set(drawn).size).toBe(3)
})

test('the scene follows her mood, the running tool, the spinner word and a long turn', () => {
  expect(sceneOf(INITIAL)).toBe('idle')
  expect(sceneOf({ ...INITIAL, mood: 'sleepy' })).toBe('sleep')
  expect(sceneOf({ ...INITIAL, mood: 'love' })).toBe('love')

  expect(sceneOf({ ...INITIAL, mood: 'working', tool: 'Bash' })).toBe('type')
  expect(sceneForTool('Read')).toBe('read')
  expect(sceneForTool('Edit')).toBe('write')
  expect(sceneForTool('Grep')).toBe('dig')
  expect(sceneForTool('WebSearch')).toBe('web')
  expect(sceneForTool('Agent')).toBe('herd')
  expect(sceneForTool('mcp__github__search')).toBe('magic')
  expect(sceneForTool('SomethingNew')).toBe('type')

  expect(sceneForWord('Sautéing')).toBe('cook')
  expect(sceneForWord('Moseying')).toBe('walk')
  expect(sceneForWord('Thinking')).toBeUndefined()

  const thinking = { ...INITIAL, mood: 'thinking', turnTick: 100 } as const
  expect(sceneOf({ ...thinking, tick: 100 }, 'Pondering')).toBe('think')
  expect(sceneOf({ ...thinking, tick: 100 }, 'Sautéing')).toBe('cook')
  // Past the first act a long think steps through the rotation, all of it.
  const acts = Array.from({ length: 7 }, (_, act) => sceneOf({ ...thinking, tick: 100 + (act + 1) * ACT_FRAMES }, 'Pondering', 5))
  expect(new Set(acts).size).toBe(7)
  expect(acts[0]).not.toBe(acts[1])
})

test('the pane draws the bunny and petting it shows love', async ($, on) => {
  mock.clock(on)
  for (const [pets, surface] of (['terminal', 'desktop'] as const).entries()) {
    const ui = await $.ui.mount({ plugin: 'bunny', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /[▀▄█]/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: pets === 0 ? /發呆中/ : /^♡$/ })).toBeDefined()
    await ui.press({ key: 'pet' })
    expect(await ui.find({ type: 'Text', text: /^♡$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: new RegExp(`♡ × ${pets + 1}`) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /發呆中/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('the session clock moves her: slowly asleep, a frame a period once a prompt wakes her', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
  const ui = await $.ui.mount({ plugin: 'bunny', surface: 'terminal', ...PANE })
  const drawn = async () => (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  const framesOver = async (periods: number) => {
    const frames = new Set<string>()

    for (let at = 0; at < periods; at += 1) {
      await clock.advance(FRAME_MS)
      frames.add(await drawn())
    }

    return frames.size
  }

  await clock.advance(FRAME_MS)
  expect(await ui.find({ type: 'Text', text: /睡著了/ })).toBeDefined()
  const asleep = await framesOver(16)
  expect(asleep).toBeGreaterThan(1)
  expect(asleep).toBeLessThan(4)

  await $.prompt.submit({ text: 'hi' } as never)
  expect(await ui.find({ type: 'Text', text: /收到！/ })).toBeDefined()
  expect(await framesOver(16)).toBeGreaterThan(asleep)
})
