// The weather outside her window, read over the network. Pure functions only;
// the fetching is register.tsx's.

export type Weather = 'clear' | 'rain' | 'storm'
export type Place = { latitude: number; longitude: number }

// How often the weather is read again.
export const WEATHER_MS = 30 * 60_000

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** A place to the nearest hundredth of a degree, about a kilometre: the town, not the street. */
const placeAt = (latitude: unknown, longitude: unknown): Place | undefined => {
  const [lat, lon] = [Number(latitude), Number(longitude)]

  return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)
    ? { latitude: Math.round(lat * 100) / 100, longitude: Math.round(lon * 100) / 100 }
    : undefined
}

// Where she is, from the network address, by the first of these that answers.
export const LOCATORS: readonly { url: string; read: (body: unknown) => Place | undefined }[] = [
  {
    url: 'https://ipwho.is/',
    read: body => (isRecord(body) && body.success === true ? placeAt(body.latitude, body.longitude) : undefined),
  },
  {
    url: 'https://get.geojs.io/v1/ip/geo.json',
    read: body => (isRecord(body) ? placeAt(body.latitude, body.longitude) : undefined),
  },
]

/** Open-Meteo's current weather at a place: free, and asks no key. */
export const forecastUrl = ({ latitude, longitude }: Place) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code`

/**
 * The weather in a WMO weather code: drizzle, rain, snow and their showers are
 * rain at her window; thunderstorms, a storm. Anything else is clear.
 */
export const weatherOf = (code: unknown): Weather => {
  if (typeof code !== 'number') {
    return 'clear'
  }

  if (code >= 95) {
    return 'storm'
  }

  return (code >= 51 && code <= 67) || (code >= 71 && code <= 86) ? 'rain' : 'clear'
}

/** What Open-Meteo answered, read: the weather now, or nothing for an answer it cannot read. */
export const forecastOf = (text: string): Weather | undefined => {
  try {
    const body: unknown = JSON.parse(text)

    return isRecord(body) && isRecord(body.current) ? weatherOf(body.current.weather_code) : undefined
  } catch {
    return undefined
  }
}
