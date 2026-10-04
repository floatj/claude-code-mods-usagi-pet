import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Mood } from '../types'
import {
  BODY_COLOR,
  captionOf,
  COLOR,
  frameOf,
  INITIAL,
  LAPTOP_COLOR,
  SCENE_WIDTH,
  sceneOf,
  setMood,
  step,
  TICK_MS,
} from './bunny'

const PANE = 'bunny'
const TITLE = '兔兔'
const COLUMNS = 22
const ROWS = 12
// Cells kept free between the rabbit's group and the pane's right edge.
const SHIFT_LEFT = 3
// Painted over the whole body, so the pane is not the dock's gray.
const BACKGROUND = '#000000'
const pet = atom({ plugin: 'bunny', key: 'pet' } as const, INITIAL)

export const register: Register = on => {
  // Tool calls in flight: the bunny works until the last one answers.
  let running = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'bunny',
      description: '叫出兔兔 (open the bunny pane)',
    })
    void $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS, rows: ROWS })
    $.clock.every(TICK_MS, () => {
      void $.clock.now().then(now => update($, pet, b => step(b, now)))
    })

    return next(e)
  })

  on('command.run', { command: 'bunny' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS, rows: ROWS })

    return { text: opened.isPlaced ? '兔兔來了 ( ·ω· )' : '兔兔現在出不來' }
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, pet, b => ({ ...setMood(b, 'shock', now), isBusy: true }))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    running += 1
    const startedAt = await $.clock.now()
    await update($, pet, b => setMood(b, 'working', startedAt, e.tool))

    try {
      const ran = await next(e)
      const isFailed = ran.deny !== undefined || ran.isError === true
      const mood: Mood = isFailed ? 'sad' : 'thinking'
      const now = await $.clock.now()

      if (running === 1 || isFailed) {
        await update($, pet, b => setMood(b, mood, now))
      }

      return ran
    } finally {
      running -= 1
    }
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, pet, b => ({
      ...setMood(b, b.mood === 'sad' ? 'sad' : 'happy', now),
      isBusy: false,
    }))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const b = await read($, pet)
    const { bodyColumns, scroll } = e.props
    const [fx] = frameOf(b)
    const scene = sceneOf(b, bodyColumns >= SCENE_WIDTH)
    const width = Math.min(SCENE_WIDTH, bodyColumns)
    const color = COLOR[b.mood]

    return (
      <Box
        flexDirection="column"
        alignItems="flex-end"
        justifyContent="flex-end"
        paddingRight={Math.max(0, Math.min(SHIFT_LEFT, bodyColumns - width))}
        width={bodyColumns}
        height={scroll.bodyRows}
        backgroundColor={BACKGROUND}
      >
        <Box flexDirection="column" width={width}>
        <Box width={width}>
          <Text color={color}>{fx}</Text>
        </Box>
        {scene.map(([rabbit, laptop]) => (
          <Box width={width}>
            <Text color={BODY_COLOR}>
              {rabbit}
            </Text>
            <Text color={LAPTOP_COLOR}>
              {laptop}
            </Text>
          </Box>
        ))}
        <Text> </Text>
        <Text key="caption" color={color}>
          {captionOf(b)}
        </Text>
        <Button
          key="pet"
          label="♡"
          hotkey="p"
          onPress={async () => {
            const now = await $.clock.now()
            await update($, pet, one => ({
              ...setMood(one, 'love', now),
              pets: one.pets + 1,
            }))
          }}
        />
        {b.pets > 0 && <Text dimColor>♡ × {b.pets}</Text>}
        </Box>
      </Box>
    )
  })
}
