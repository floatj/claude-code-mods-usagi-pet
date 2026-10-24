import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mood } from '../types'
import { captionOf, COLOR, INITIAL, setMood, step } from './bunny'
import { FRAME_MS, frameRows, MAX_STAGE, sceneOf, skyAt, STAGE_ROWS } from './scenes'

const PANE = 'bunny'
const TITLE = '兔兔'
const COLUMNS = 22
const ROWS = 12
// Cells kept free between the rabbit's stage and the pane's right edge.
const SHIFT_LEFT = 3
// Asleep she breathes slowly: her frame moves on one clock period in this many.
const SLEEP_EVERY = 8
// A prompt now and then sets her transforming; a turn this long ends in a blast.
const TRANSFORM_CHANCE = 0.2
const BLAST_AFTER_MS = 120_000
// Set pieces a tool call does not cut short.
const SHOWS: readonly Mood[] = ['transform', 'blast', 'welcome']
// Painted over the whole body, so the pane is not the dock's gray.
const BACKGROUND = '#000000'
const pet = atom({ plugin: 'bunny', key: 'pet' } as const, INITIAL)

// The spinner's word, read while it draws. State cannot be written during a
// render, so it lives here; the frame clock's redraws pick it up.
let word = ''
// Where this session's rotation of scenes starts.
let seed = 0

// Her frame clock, and the periods it has counted.
let frames: Timer | undefined
let period = 0
// When the turn running began.
let turnAt = 0

const wake = ($: EngineInterface) => {
  frames ??= $.clock.every(FRAME_MS, () => void frame($))
}

const frame = async ($: EngineInterface) => {
  period += 1

  if ((await read($, pet)).mood === 'sleepy' && period % SLEEP_EVERY !== 0) {
    return
  }

  const now = await $.clock.now()
  await update($, pet, one => step(one, now))
}

export const register: Register = on => {
  // Tool calls in flight: the bunny works until the last one answers.
  let running = 0
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'bunny',
      description: '叫出兔兔 (open the bunny pane)',
    })
    void $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS, rows: ROWS })
    seed = Math.floor(await $.clock.now()) % 997
    // A reload starts the module over, its timers gone with it.
    frames = undefined
    wake($)

    return next(e)
  })

  on('command.run', { command: 'bunny' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS, rows: ROWS })

    return { text: opened.isPlaced ? '兔兔來了 ( ·ω· )' : '兔兔現在出不來' }
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    turnAt = now
    // Woken, she greets you; else a start, or now and then a transformation.
    const isAsleep = (await read($, pet)).mood === 'sleepy'
    const mood: Mood = isAsleep ? 'welcome' : Math.random() < TRANSFORM_CHANCE ? 'transform' : 'shock'
    await update($, pet, b => ({ ...setMood(b, mood, now), isBusy: true, turnTick: b.tick }))
    wake($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    running += 1
    const startedAt = await $.clock.now()
    await update($, pet, b => (SHOWS.includes(b.mood) ? { ...b, tool: e.tool } : setMood(b, 'working', startedAt, e.tool)))
    wake($)

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
      ...setMood(b, b.mood === 'sad' ? 'sad' : now - turnAt >= BLAST_AFTER_MS ? 'blast' : 'happy', now),
      isBusy: false,
    }))
    wake($)

    return next(e)
  })

  // Observe only: remember what the spinner says, and let the engine draw it.
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    word = e.props.message ?? e.props.word

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const { bodyColumns, scroll } = e.props

    // A rabbit kept from before a reload may lack what was added since.
    const b = { ...INITIAL, ...(await read($, pet)) }
    const width = Math.max(1, Math.min(bodyColumns, MAX_STAGE))
    const stage = frameRows(sceneOf(b, word, seed), b.tick, width, b.tick - b.moodTick, skyAt(await $.clock.now()))
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
        <Box flexDirection="column" alignItems="center" width={width}>
        <Box flexDirection="column" width={width} height={STAGE_ROWS}>
          {stage.map(runs => (
            <Text>
              {runs.map(run => (
                <Text color={run.color} backgroundColor={run.bg ?? BACKGROUND}>
                  {run.text}
                </Text>
              ))}
            </Text>
          ))}
        </Box>
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
            wake($)
          }}
        />
        {b.pets > 0 && <Text dimColor>♡ × {b.pets}</Text>}
        </Box>
      </Box>
    )
  })
}
