import { expect, mock, test } from 'claude-code/testing'

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
