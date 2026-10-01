export const HOTEL_TIMEZONE = process.env.HOTEL_TIMEZONE || 'America/Detroit'

function parts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: HOTEL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })

  const map = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  )

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute)
  }
}

export function ymdInHotelTz(date = new Date()) {
  const p = parts(date)
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`
}

function addDaysYmd(ymd: string, days: number) {
  const [y,m,d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0))
  return dt.toISOString().slice(0,10)
}

export function guestServiceDate(now = new Date()): { open: boolean; serviceDate: string; reason?: string } {
  const p = parts(now)
  const today = ymdInHotelTz(now)

  // Guest service date rolls to NEXT DAY at 6:00 AM Eastern.
  // Before 6:00 AM, submissions belong to the current service date.
  // From 6:00 AM onward, submissions belong to the following service date.
  const rolloverH = Number(process.env.GUEST_SERVICE_DATE_ROLLOVER_HOUR || 6)
  const rolloverM = Number(process.env.GUEST_SERVICE_DATE_ROLLOVER_MINUTE || 0)
  const mins = p.hour * 60 + p.minute

  return {
    open: true,
    serviceDate: mins >= rolloverH * 60 + rolloverM ? addDaysYmd(today, 1) : today
  }
}

export function bohDefaultServiceDate(now = new Date()) {
  const p = parts(now)
  const today = ymdInHotelTz(now)
  const rolloverH = Number(process.env.BOH_ROLLOVER_HOUR || 10)
  const rolloverM = Number(process.env.BOH_ROLLOVER_MINUTE || 30)
  const mins = p.hour * 60 + p.minute

  return mins >= rolloverH * 60 + rolloverM ? addDaysYmd(today, 1) : today
}

export function generateTimeSlots() {
  const start = process.env.BREAKFAST_START || '08:00'
  const end = process.env.BREAKFAST_END || '10:00'
  const step = Number(process.env.SLOT_MINUTES || 15)

  const toMinutes = (s: string) => {
    const [h,m] = s.split(':').map(Number)
    return h * 60 + m
  }

  const startM = toMinutes(start)
  const endM = toMinutes(end)
  const out: string[] = []

  for (let m = startM; m < endM; m += step) {
    out.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`)
  }

  return out
}

export function formatTime24(time: string) {
  const [h,m] = time.slice(0,5).split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 || 12
  return `${hh}:${String(m).padStart(2,'0')} ${ap}`
}

export function prettyDate(ymd: string) {
  const [y,m,d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m-1, d, 12))
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date)
}
