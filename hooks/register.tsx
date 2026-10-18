import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mood } from '../types'
import { captionOf, COLOR, INITIAL, setMood, step } from './bunny'
import { advance, close, CLOSED, GAME_TICK_MS, LANE_WIDTH, LANES, start, steer, trackOf } from './game'
import type { Cell } from './game'
import { FUR_COLOR, FRAME_MS, frameRows, MAX_STAGE, sceneOf, STAGE_ROWS } from './scenes'

const PANE = 'bunny'
const TITLE = '兔兔'
const COLUMNS = 22
const ROWS = 12
// Cells kept free between the rabbit's stage and the pane's right edge.
const SHIFT_LEFT = 3
// Asleep she breathes slowly: her frame moves on one clock period in this many.
const SLEEP_EVERY = 4
// Painted over the whole body, so the pane is not the dock's gray.
const BACKGROUND = '#000000'
const pet = atom({ plugin: 'bunny', key: 'pet' } as const, INITIAL)
const game = atom({ plugin: 'bunny', key: 'game' } as const, CLOSED)

const TRACK_COLOR: Record<Cell['kind'], string | undefined> = {
  empty: undefined,
  train: '#ff5f5f',
  coin: '#ffd700',
  rabbit: FUR_COLOR,
}

// The spinner's word, read while it draws. State cannot be written during a
// render, so it lives here; the frame clock's redraws pick it up.
let word = ''
// Where this session's rotation of scenes starts.
let seed = 0

// The game's clock, running only while a run is on.
let ticker: Timer | undefined

const halt = () => {
  ticker?.cancel()
  ticker = undefined
}

const play = async ($: EngineInterface) => {
  halt()
  await update($, game, start)
  void $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS, rows: ROWS, focus: true })
  ticker = $.clock.every(GAME_TICK_MS, () => {
    void update($, game, g => advance(g, Math.random())).then(() =>
      read($, game).then(g => {
        if (g.isOver || !g.isOpen) {
          halt()
        }
      }),
    )
  })
}

const leave = async ($: EngineInterface) => {
  halt()
  await update($, game, close)
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
    // A reload drops the game's clock, so a run left open would stand still.
    await update($, game, close)
    seed = Math.floor(await $.clock.now()) % 997
    let period = 0
    $.clock.every(FRAME_MS, () => {
      period += 1
      void read($, pet).then(async b => {
        if (b.mood === 'sleepy' && period % SLEEP_EVERY !== 0) {
          return
        }

        const now = await $.clock.now()
        await update($, pet, one => step(one, now))
      })
    })

    return next(e)
  })

  on('command.run', { command: 'bunny' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS, rows: ROWS })

    return { text: opened.isPlaced ? '兔兔來了 ( ·ω· )' : '兔兔現在出不來' }
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, pet, b => ({ ...setMood(b, 'shock', now), isBusy: true, turnTick: b.tick }))

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

  // Observe only: remember what the spinner says, and let the engine draw it.
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    word = e.props.message ?? e.props.word

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const { bodyColumns, scroll } = e.props
    const g = await read($, game)

    if (g.isOpen) {
      // The lane lines are drawn only where the pane is wide enough for them.
      const hasLines = bodyColumns >= LANES * LANE_WIDTH + LANES + 1
      const line = hasLines ? <Text dimColor>┆</Text> : null

      return (
        <Box
          flexDirection="column"
          alignItems="center"
          justifyContent="flex-end"
          width={bodyColumns}
          height={scroll.bodyRows}
          backgroundColor={BACKGROUND}
        >
          <Text color={g.isOver ? '#ff5f5f' : undefined}>
            {g.isOver ? `撞到了！${g.score} 分` : `分數 ${g.score}`}
          </Text>
          <Text dimColor>最高 {g.best}</Text>
          {trackOf(g).map(cells => (
            <Box>
              {cells.map(cell => (
                <Box>
                  {line}
                  <Text color={TRACK_COLOR[cell.kind]}>{cell.text}</Text>
                </Box>
              ))}
              {line}
            </Box>
          ))}
          <Text> </Text>
          {g.isOver ? (
            <Button key="again" label="再玩一次" hotkey="r" onPress={() => play($)} />
          ) : (
            <Box gap={1}>
              <Button key="left" label="←" hotkey="a" onPress={() => update($, game, one => steer(one, -1))} />
              <Button key="right" label="→" hotkey="d" onPress={() => update($, game, one => steer(one, 1))} />
            </Box>
          )}
          <Text dimColor>{g.isOver ? 'r 再玩' : 'a ← 移動 → d'}</Text>
          <Button key="exit" label="X" hotkey="x" onPress={() => leave($)} />
        </Box>
      )
    }

    // A rabbit kept from before a reload may lack what was added since.
    const b = { ...INITIAL, ...(await read($, pet)) }
    const width = Math.max(1, Math.min(bodyColumns, MAX_STAGE))
    const stage = frameRows(sceneOf(b, word, seed), b.tick, width, b.tick - b.moodTick)
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
        <Box gap={1}>
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
          <Button key="game" label="跑酷" hotkey="g" onPress={() => play($)} />
        </Box>
        {b.pets > 0 && <Text dimColor>♡ × {b.pets}</Text>}
        </Box>
      </Box>
    )
  })
}
