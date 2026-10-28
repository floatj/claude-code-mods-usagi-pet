import { expect, mock, test } from 'claude-code/testing'

import { INITIAL, setMood, SLEEP_AFTER_MS, step } from './bunny'
import { forecastOf, LOCATORS, weatherOf } from './weather'
import { ACT_FRAMES, FRAME_MS, frameRows, MAX_STAGE, REEL, SCENE_NAMES, sceneForTool, sceneForWord, sceneOf, skyAt, STAGE_ROWS } from './scenes'

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

test('the weather is read from Open-Meteo and the locators, and rains at her window', () => {
  expect([0, 3, 51, 63, 81, 71, 95, 99].map(weatherOf)).toEqual(['clear', 'clear', 'rain', 'rain', 'rain', 'rain', 'storm', 'storm'])
  expect(forecastOf('{"current":{"weather_code":81}}')).toBe('rain')
  expect(forecastOf('not json')).toBeUndefined()
  expect(LOCATORS[0]!.read({ success: true, latitude: 24.9936806, longitude: 121.2969641 })).toEqual({ latitude: 24.99, longitude: 121.3 })
  expect(LOCATORS[0]!.read({ success: false })).toBeUndefined()
  expect(LOCATORS[1]!.read({ latitude: '24.9977', longitude: '121.2965' })).toEqual({ latitude: 25, longitude: 121.3 })

  for (const sky of ['day', 'dusk', 'night'] as const) {
    const [clear, rain, storm] = (['clear', 'rain', 'storm'] as const).map(one => JSON.stringify(frameRows('sleep', 0, MAX_STAGE, 0, sky, one)))
    expect(rain).not.toBe(clear)
    // Frame 0 is a strike.
    expect(storm).not.toBe(rain)
  }
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
  expect(sceneForWord('Vibing')).toBe('miku')
  expect(sceneForWord('Processing')).toBeUndefined()
  expect(sceneForWord('Musing')).toBeUndefined()
  expect(sceneForWord('Dancing')).toBe('dance')
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

test('the session clock moves her: booted up, slowly asleep, greeting you or transforming as a prompt wakes her, one of three beams after a long turn', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
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
  expect(await ui.find({ type: 'Text', text: /兔兔 啟動|少女祈禱中/ })).toBeDefined()
  await clock.advance(5_400)
  expect(await ui.find({ type: 'Text', text: /睡著了/ })).toBeDefined()
  const asleep = await framesOver(16)
  expect(asleep).toBeGreaterThan(1)
  expect(asleep).toBeLessThan(4)

  await $.prompt.submit({ text: 'hi' } as never)
  // Woken, she greets you or, now and then, transforms.
  expect(await ui.find({ type: 'Text', text: /歡迎回來|變身/ })).toBeDefined()
  expect(await framesOver(16)).toBeGreaterThan(asleep)

  await clock.advance(120_000)
  await $.turn.complete({ reason: 'answered', turnId: 't1' } as never)
  // One of three beams: the blast, the buster opening on READY, or the magician flying in.
  expect(await ui.find({ type: 'Text', text: /全力全開|READY|普通的魔法使/ })).toBeDefined()
})

test('the play-all button plays every scene in turn, and stops when pressed again', async ($, on) => {
  const clock = mock.clock(on)
  expect(REEL.map(one => one.scene).sort()).toEqual([...SCENE_NAMES].sort())
  const ui = await $.ui.mount({ plugin: 'bunny', surface: 'terminal', ...PANE })
  await ui.press({ key: 'reel' })
  expect(await ui.find({ type: 'Text', text: /▶ 1\/\d+ 開機：掌機/ })).toBeDefined()

  for (let at = 0; at < REEL[0]!.frames; at += 1) {
    await clock.advance(FRAME_MS)
  }

  expect(await ui.find({ type: 'Text', text: /▶ 2\/\d+ 開機：BIOS/ })).toBeDefined()
  await ui.press({ key: 'reel' })
  expect(await ui.find({ type: 'Text', text: /▶ \d+\// })).toBeUndefined()
  await ui.unmount()
})

const BAND = {
    component: 'AbovePrompt',
    requestId: 'bunny-band',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as const

test('a session after one that moved her above the prompt starts her there, her pane left shut', async ($, on) => {
  mock.clock(on)
  mock.store(on, { placement: 'band' })
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'bunny' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
  const band = await $.ui.mount({ plugin: 'bunny', surface: 'terminal', ...BAND })
  expect(await band.find({ type: 'Text', text: /[▀▄█]/ })).toBeDefined()
  await band.unmount()
})

test('/bunny 上方 moves her above the prompt and /bunny 側欄 back', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const closed: string[] = []
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const
  on('command.register', () => ({ value: { command: 'bunny' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', (_, e) => {
    closed.push(e.id)

    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'bunny', args: '上方', ...RUN })).text).toMatch(/輸入框上方/)
  expect(closed).toEqual(['bunny'])

  const band = await $.ui.mount({ plugin: 'bunny', surface: 'terminal', ...BAND })
  expect(await band.find({ type: 'Text', text: /[▀▄█]/ })).toBeDefined()
  await band.press({ key: 'pet' })
  expect(await band.find({ type: 'Text', text: /♡ × 1/ })).toBeDefined()

  expect((await $.command.run({ command: 'bunny', args: '側欄', ...RUN })).text).toMatch(/兔兔來了/)
  // Back in her pane she leaves the band to whatever draws beneath.
  expect(await band.find({ type: 'Text', text: /^beneath$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /[▀▄█]/ })).toBeUndefined()
  expect((await $.command.run({ command: 'bunny', args: '下面', ...RUN })).text).toMatch(/不認得/)
  await band.unmount()
})

test('/bunny 合併 opens the dashboard and stands her under its drawing', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const ran: string[] = []
  const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const
  on('command.register', () => ({ value: { command: 'bunny' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('command.run', { command: 'dash' }, (_, e) => {
    ran.push(e.command)

    return { text: '儀表板開了' }
  })
  // The dashboard's own drawing, beneath her.
  on('ui.render', { component: 'Pane', requestId: 'dash' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>計畫 1/3</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'bunny', args: '合併', ...RUN })).text).toMatch(/儀表板下面/)
  await clock.advance(1)
  expect(ran).toEqual(['dash'])

  const dash = await $.ui.mount({
    plugin: 'bunny',
    surface: 'terminal',
    ...PANE,
    requestId: 'dash',
    props: { ...PANE.props, title: '儀表板', bodyColumns: 44, scroll: { offset: 0, bodyRows: 40 } },
  })
  expect(await dash.find({ type: 'Text', text: /計畫 1\/3/ })).toBeDefined()
  expect(await dash.find({ type: 'Text', text: /[▀▄█]/ })).toBeDefined()

  await $.command.run({ command: 'bunny', args: '側欄', ...RUN })
  expect(await dash.find({ type: 'Text', text: /計畫 1\/3/ })).toBeDefined()
  expect(await dash.find({ type: 'Text', text: /[▀▄█]/ })).toBeUndefined()
  await dash.unmount()
})
