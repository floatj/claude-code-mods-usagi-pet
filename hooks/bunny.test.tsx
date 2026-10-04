import { expect, mock, test } from 'claude-code/testing'

import { advance, CLOSED, start, steer, TRACK_ROWS } from './game'
import { frameOf, INITIAL, setMood, SLEEP_AFTER_MS, step } from './bunny'

const PANE = {
  component: 'Pane',
  requestId: 'bunny',
  props: {
    title: '兔兔',
    isFocused: false,
    bodyColumns: 16,
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
  expect(frameOf(step(INITIAL, 1))).toHaveLength(4)
})

test('the pane draws the bunny and petting it shows love', async ($, on) => {
  mock.clock(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'bunny', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /ω/ })).toBeDefined()
    await ui.press({ key: 'pet' })
    expect(await ui.find({ type: 'Text', text: /^♡$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /♡ω♡/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the runner scores rows and coins, and a train ends the run', () => {
  let g = start(CLOSED)
  // Roll 0 spawns a train in the left lane; she stands in the middle one.
  for (let at = 0; at < TRACK_ROWS * 3; at += 1) g = advance(g, 0)
  expect(g.isOver).toBe(false)
  expect(g.score).toBe(TRACK_ROWS)

  const hit = steer({ ...g, rows: [...g.rows.slice(0, -1), '#o '] }, -1)
  expect(hit.isOver).toBe(true)
  expect(hit.best).toBe(g.score)
  expect(steer(hit, 1)).toBe(hit)

  const coin = steer({ ...g, lane: 0, rows: [...g.rows.slice(0, -1), ' o '] }, 1)
  expect(coin.score).toBe(g.score + 5)
})

test('the game button swaps the pane to the runner and X swaps it back', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'bunny', surface, ...PANE })
    await ui.press({ key: 'game' })
    expect(await ui.find({ type: 'Text', text: /分數 0/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\(·ω·\)/ })).toBeDefined()
    await ui.press({ key: 'right' })
    await ui.press({ key: 'exit' })
    expect(await ui.find({ key: 'pet' })).toBeDefined()
    await ui.unmount()
  }
})
