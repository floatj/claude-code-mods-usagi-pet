import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mood } from '../types'
import { captionOf, COLOR, INITIAL, setMood, step } from './bunny'
import { FRAME_MS, frameRows, isMoonlitAt, MAX_STAGE, REEL, reelAt, sceneOf, skyAt, STAGE_ROWS } from './scenes'
import { forecastOf, forecastUrl, LOCATORS, WEATHER_MS } from './weather'
import type { Place, Weather } from './weather'

const PANE = 'bunny'
const TITLE = '兔兔'
const COLUMNS = 22
const ROWS = 12
// Cells kept free between the rabbit's stage and the pane's right edge.
const SHIFT_LEFT = 3
// Asleep she breathes slowly: her frame moves on one clock period in this many.
const SLEEP_EVERY = 8
// A prompt now and then sets her transforming, a little more often one that
// wakes her; a turn this long ends in one of three beams: the blast, the robot
// boy's buster or the magician's spark.
const TRANSFORM_CHANCE = 0.2
const WAKE_TRANSFORM_CHANCE = 0.25
const BLAST_AFTER_MS = 120_000
const LONG_TURNS: readonly Mood[] = ['blast', 'buster', 'spark']
// A turn done this quickly now and then has the maid stop time for it; on a
// full moon's night the moon rabbit comes now and then, and a prompt naming her
// brings her at once.
const QUICK_MS = 15_000
const WORLD_CHANCE = 0.2
const LUNATIC_CHANCE = 0.15
const LUNATIC_WORDS = /鈴仙|優曇華|月兔|reisen|udonge|うどんげ/i
// Set pieces a tool call does not cut short.
const SHOWS: readonly Mood[] = ['transform', 'blast', 'welcome', 'boot', 'ditto', 'mimikyu', 'ranranru', 'aqua', 'excalibur', 'buster', 'spark', 'world', 'lunatic']
// Now and then an edit brings the shapeshifter; a failure, the goddess or the
// ghost in its disguise; a finished turn, the clown's chant or the knight's sword.
const EDITS = /^(Edit|Write|MultiEdit|NotebookEdit)$/
const DITTO_CHANCE = 0.05
const AQUA_CHANCE = 0.1
const MIMIKYU_CHANCE = 0.07
const RANRANRU_CHANCE = 0.07
const EXCALIBUR_CHANCE = 0.07

/** What a failed tool brings on: her sorrow, or now and then a parody of it. */
const failure = (): Mood => {
  const roll = Math.random()

  return roll < AQUA_CHANCE ? 'aqua' : roll < AQUA_CHANCE + MIMIKYU_CHANCE ? 'mimikyu' : 'sad'
}

/** What a finished turn brings on: her joy, or now and then a parody. */
const finale = (): Mood => {
  const roll = Math.random()

  return roll < RANRANRU_CHANCE ? 'ranranru' : roll < RANRANRU_CHANCE + EXCALIBUR_CHANCE ? 'excalibur' : 'happy'
}

/** How a turn that took `took` ms ends at `now`: a beam after a long one, else the maid, the moon rabbit, or the finale. */
const ending = (took: number, now: number): Mood => {
  if (took >= BLAST_AFTER_MS) {
    return LONG_TURNS[Math.floor(Math.random() * LONG_TURNS.length)]!
  }

  if (took < QUICK_MS && Math.random() < WORLD_CHANCE) {
    return 'world'
  }

  return isMoonlitAt(now) && Math.random() < LUNATIC_CHANCE ? 'lunatic' : finale()
}
// Painted over the whole body, so the pane is not the dock's gray.
const BACKGROUND = '#000000'
const pet = atom({ plugin: 'bunny', key: 'pet' } as const, INITIAL)
// Where she shows: her pane, or the band above the prompt. Kept across
// sessions in the store under this key.
const PLACEMENT = 'placement'
const placement = atom({ plugin: 'bunny', key: 'placement' } as const, 'pane')
const SIDE_WORDS = ['側欄', 'pane', 'side']
const BAND_WORDS = ['上方', 'band', 'top']
const MERGED_WORDS = ['合併', 'merge', 'merged', 'dash']
// Merged, she stands under the dashboard in its pane, these rows tall.
const DASH_PANE = 'dash'
// Her black ground under the dashboard, rows tall: she stands at its foot.
const MERGED_ROWS = 16
type Placement = 'pane' | 'band' | 'merged'

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
// The frame the play-all reel started on, while it runs.
let reelFrom: number | undefined
// The weather at her window, and where she is, found once a session.
let weather: Weather = 'clear'
let place: Place | undefined

const locate = async ($: EngineInterface): Promise<Place | undefined> => {
  for (const { url, read: readPlace } of LOCATORS) {
    const found = await $.http
      .fetch(url)
      .then(res => (res.ok ? readPlace(JSON.parse(res.text)) : undefined))
      .catch(() => undefined)

    if (found) {
      return found
    }
  }

  return undefined
}

// Reads the weather afresh; on any failure it keeps what it had, clear to begin with.
const readWeather = async ($: EngineInterface) => {
  place ??= await locate($)

  if (place) {
    const res = await $.http.fetch(forecastUrl(place)).catch(() => undefined)
    weather = (res?.ok ? forecastOf(res.text) : undefined) ?? weather
  }
}

const wake = ($: EngineInterface) => {
  frames ??= $.clock.every(FRAME_MS, () => void frame($))
}

const frame = async ($: EngineInterface) => {
  period += 1

  if (reelFrom === undefined && (await read($, pet)).mood === 'sleepy' && period % SLEEP_EVERY !== 0) {
    return
  }

  const now = await $.clock.now()
  await update($, pet, one => step(one, now))
}

// Her stage as it stands, `width` cells wide: the rows, the caption and its color, and the reel if one plays.
const staged = async ($: EngineInterface, width: number) => {
  // A rabbit kept from before a reload may lack what was added since.
  const b = { ...INITIAL, ...(await read($, pet)) }
  const sky = skyAt(await $.clock.now())
  // The reel, while it runs, plays in place of what she is doing; past its end it stops.
  const reel = reelFrom === undefined ? undefined : reelAt(b.tick - reelFrom)
  reelFrom = reel === undefined ? undefined : reelFrom
  const scene = sceneOf(b, word, seed)
  const stage = reel
    ? frameRows(reel.scene, b.tick, width, reel.since, sky, weather)
    : frameRows(scene, b.tick, width, b.tick - b.moodTick, sky, weather)

  return {
    b,
    stage,
    color: reel ? 'magenta' : COLOR[b.mood],
    caption: reel ? `▶ ${reel.index + 1}/${REEL.length} ${reel.label}` : captionOf(b, scene),
    isReeling: reel !== undefined,
  }
}

const petHer = async ($: EngineInterface) => {
  const now = await $.clock.now()
  await update($, pet, one => ({
    ...setMood(one, 'love', now),
    pets: one.pets + 1,
  }))
  wake($)
}

// Play every scene from the first, or stop the one playing.
const toggleReel = async ($: EngineInterface) => {
  reelFrom = reelFrom === undefined ? (await read($, pet)).tick : undefined
  await update($, pet, one => ({ ...one }))
  wake($)
}

// Moves her to `where`, kept for the sessions after: her pane opens for the
// pane and closes otherwise; merged, the dashboard is opened for her to stand under.
const placeAt = async ($: EngineInterface, where: Placement) => {
  await update($, placement, () => where)
  await $.store.set(PLACEMENT, where).catch(() => undefined)

  if (where === 'pane') {
    return $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS, rows: ROWS })
  }

  await $.ui.close({ id: PANE })

  // A command cannot run another while it holds the turn: the dashboard opens just after.
  if (where === 'merged') {
    $.clock.after(0, () => void $.command.run({ command: 'dash' }).catch(() => undefined))
  }

  return { isPlaced: true }
}

export const register: Register = on => {
  // Tool calls in flight: the bunny works until the last one answers.
  let running = 0
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'bunny',
      description: '叫出兔兔 (open the bunny pane)；/bunny 上方、側欄 或 合併 換位置',
      argumentHint: '[上方|側欄|合併]',
    })
    const saved = await $.store.get(PLACEMENT).catch(() => undefined)
    const where: Placement = saved === 'band' || saved === 'merged' ? saved : 'pane'
    await update($, placement, () => where)

    if (where === 'pane') {
      void $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS, rows: ROWS })
    }
    seed = Math.floor(await $.clock.now()) % 997
    // A new session boots her up; a reload, which finds her already going, does not.
    const now = await $.clock.now()
    await update($, pet, b => (b.tick === 0 ? setMood(b, 'boot', now) : b))
    // A reload starts the module over, its timers gone with it.
    frames = undefined
    wake($)
    void readWeather($)
    $.clock.every(WEATHER_MS, () => void readWeather($))

    return next(e)
  })

  // Bare, she comes where she was last; named, she moves there and stays.
  on('command.run', { command: 'bunny' }, async ($, e) => {
    const arg = String(e.args ?? '').trim().toLowerCase()
    const asked: Placement | undefined | null = SIDE_WORDS.includes(arg)
      ? 'pane'
      : BAND_WORDS.includes(arg)
        ? 'band'
        : MERGED_WORDS.includes(arg)
          ? 'merged'
          : arg === ''
            ? undefined
            : null

    if (asked === null) {
      return { text: `不認得「${arg}」：用 /bunny 上方、/bunny 側欄 或 /bunny 合併` }
    }

    const where = asked ?? (await read($, placement))
    const opened = await placeAt($, where)

    if (!opened.isPlaced) {
      return { text: '兔兔現在出不來' }
    }

    return {
      text:
        where === 'band' ? '兔兔在輸入框上方 ( ·ω· )' : where === 'merged' ? '兔兔在儀表板下面 ( ·ω· )' : '兔兔來了 ( ·ω· )',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    turnAt = now
    // Named, the moon rabbit comes; else now and then she transforms, else, woken,
    // she greets you, and awake she starts.
    const isAsleep = (await read($, pet)).mood === 'sleepy'
    const isTransforming = Math.random() < (isAsleep ? WAKE_TRANSFORM_CHANCE : TRANSFORM_CHANCE)
    const mood: Mood = LUNATIC_WORDS.test(e.text ?? '') ? 'lunatic' : isTransforming ? 'transform' : isAsleep ? 'welcome' : 'shock'
    await update($, pet, b => ({ ...setMood(b, mood, now), isBusy: true, turnTick: b.tick }))
    wake($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    running += 1
    const startedAt = await $.clock.now()
    const isDitto = EDITS.test(e.tool) && Math.random() < DITTO_CHANCE
    await update($, pet, b =>
      SHOWS.includes(b.mood) ? { ...b, tool: e.tool } : setMood(b, isDitto ? 'ditto' : 'working', startedAt, e.tool),
    )
    wake($)

    try {
      const ran = await next(e)
      const isFailed = ran.deny !== undefined || ran.isError === true
      const now = await $.clock.now()

      if (isFailed) {
        const mood = failure()
        await update($, pet, b => setMood(b, mood, now))
      } else if (running === 1) {
        // Back to thinking, unless a set piece is still playing.
        await update($, pet, b => (SHOWS.includes(b.mood) ? b : setMood(b, 'thinking', now)))
      }

      return ran
    } finally {
      running -= 1
    }
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, pet, b => ({
      // A sorrow or a set piece still playing stays; else a beam after a long turn,
      // now and then a parody, and otherwise her joy.
      ...(b.mood === 'sad' || SHOWS.includes(b.mood) ? b : setMood(b, ending(now - turnAt, now), now)),
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
    const width = Math.max(1, Math.min(bodyColumns, MAX_STAGE))
    const { b, stage, color, caption, isReeling } = await staged($, width)

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
          {caption}
        </Text>
        <Box gap={1}>
          <Button key="pet" label="♡" hotkey="p" onPress={() => petHer($)} />
          <Button key="reel" label={isReeling ? '■' : '▶'} hotkey="r" onPress={() => toggleReel($)} />
        </Box>
        {b.pets > 0 && <Text dimColor>♡ × {b.pets}</Text>}
        </Box>
      </Box>
    )
  })

  // Merged, she wraps the dashboard's drawing: it above, clipped to the room
  // her rows leave, and she fixed at the bottom. The dashboard's own scroll
  // moves the whole tree, so what does not fit is cut, not scrolled.
  on('ui.render', { component: 'Pane', requestId: DASH_PANE }, async ($, e, next) => {
    const above = await next(e)

    if ((await read($, placement)) !== 'merged') {
      return above
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const { bodyColumns, scroll } = e.props
    const width = Math.max(1, Math.min(bodyColumns, MAX_STAGE))
    const { b, stage, color, caption, isReeling } = await staged($, width)

    return (
      <Box flexDirection="column" width={bodyColumns} height={scroll.bodyRows} backgroundColor={BACKGROUND}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
          {/* At its own height, so a long dashboard is cut at the bottom, not squeezed. */}
          <Box flexDirection="column" flexShrink={0}>
            {above}
          </Box>
        </Box>
        <Box
          flexDirection="column"
          alignItems="center"
          justifyContent="flex-end"
          flexShrink={0}
          width={bodyColumns}
          height={Math.min(MERGED_ROWS, scroll.bodyRows)}
          backgroundColor={BACKGROUND}
        >
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
          <Box gap={1}>
            <Text key="caption" color={color}>
              {caption}
            </Text>
            <Button key="pet" label="♡" hotkey="p" onPress={() => petHer($)} />
            <Button key="reel" label={isReeling ? '■' : '▶'} hotkey="r" onPress={() => toggleReel($)} />
            {b.pets > 0 && <Text dimColor>× {b.pets}</Text>}
          </Box>
        </Box>
      </Box>
    )
  })

  // Above the prompt she stands on the left, her caption and buttons beside
  // her, as tall as her stage. A survey there has the band to itself.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, placement)) !== 'band') {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const width = Math.max(1, Math.min(e.props.bodyColumns - 12, MAX_STAGE))
    const { b, stage, color, caption, isReeling } = await staged($, width)

    return (
      <Box flexDirection="row" gap={2} height={STAGE_ROWS}>
        <Box flexDirection="column" width={width} height={STAGE_ROWS} backgroundColor={BACKGROUND}>
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
        <Box flexDirection="column" justifyContent="flex-end" flexShrink={1}>
          <Text key="caption" color={color} wrap="wrap">
            {caption}
          </Text>
          <Box gap={1}>
            <Button key="pet" label="♡" hotkey="p" onPress={() => petHer($)} />
            <Button key="reel" label={isReeling ? '■' : '▶'} hotkey="r" onPress={() => toggleReel($)} />
          </Box>
          {b.pets > 0 && <Text dimColor>♡ × {b.pets}</Text>}
        </Box>
      </Box>
    )
  })
}
