type TallyOption = {
  id?: string
  value?: string
  text?: string
  label?: string
}

type TallyField = {
  key?: string
  label?: string
  value?: unknown
  options?: TallyOption[]
}

function normalizeToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
}

function printable(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(printable).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('text' in obj) return printable(obj.text)
    if ('label' in obj) return printable(obj.label)
    if ('value' in obj) return printable(obj.value)
    if ('name' in obj) return printable(obj.name)
    return JSON.stringify(value)
  }
  return String(value)
}

function printableField(field?: TallyField): string {
  if (!field) return ''

  const optionMap = new Map<string,string>()
  for (const option of field.options || []) {
    const key = String(option.id ?? option.value ?? '')
    const label = printable(option.text ?? option.label ?? option.value ?? option.id)
    if (key && label) optionMap.set(key,label)
  }

  const resolve = (value: unknown): string => {
    if (value == null) return ''
    if (Array.isArray(value)) return value.map(resolve).filter(Boolean).join(', ')
    if (typeof value === 'string' || typeof value === 'number') {
      const raw = String(value)
      return optionMap.get(raw) || raw
    }
    return printable(value)
  }

  return resolve(field.value)
}

export function tallyFields(payload: any): TallyField[] {
  const fields = payload?.data?.fields || payload?.fields || []
  return Array.isArray(fields) ? fields : []
}

function hiddenFieldValue(payload: any, aliases: string[]) {
  const wanted = new Set(aliases.map(normalizeToken))
  const candidates = [
    payload?.data?.hiddenFields,
    payload?.hiddenFields,
    payload?.data?.hidden_fields,
    payload?.hidden_fields
  ]

  for (const candidate of candidates) {
    if (!candidate) continue

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const key = normalizeToken(item?.key ?? item?.label ?? item?.name)
        if (wanted.has(key)) return printable(item?.value)
      }
      continue
    }

    if (typeof candidate === 'object') {
      for (const [key,value] of Object.entries(candidate)) {
        if (wanted.has(normalizeToken(key))) return printable(value)
      }
    }
  }

  return ''
}

export function getField(payload: any, aliases: string[]) {
  const wanted = new Set(aliases.map(normalizeToken))

  const field = tallyFields(payload).find(f =>
    wanted.has(normalizeToken(f.label)) ||
    wanted.has(normalizeToken(f.key))
  )

  if (field) return printableField(field)
  return hiddenFieldValue(payload,aliases)
}

export function getSubmissionId(payload: any) {
  return String(
    payload?.data?.submissionId ||
    payload?.data?.responseId ||
    payload?.submissionId ||
    payload?.responseId ||
    payload?.eventId ||
    ''
  )
}

export function getSubmittedAt(payload: any) {
  return String(
    payload?.data?.createdAt ||
    payload?.data?.submittedAt ||
    payload?.createdAt ||
    payload?.submittedAt ||
    new Date().toISOString()
  )
}

export function normalizeGuest(payload: any, guest: 1 | 2) {
  const p = `G${guest}`

  return {
    guestNumber: guest,
    dietary: getField(payload, guest === 1
      ? ['1-DR','G1 DR','G1 Dietary Restrictions','G1 Dietary Restrictions:']
      : ['2-DR','G2 DR','G2 Dietary Restrictions','G2 Dietary Restrictions:']),
    dietaryComments: getField(payload, [
      `${p} DR comments`,
      `${p} DR Comments`,
      `${p} Comments`,
      `Comments ${p}`
    ]),
    entree: getField(payload, [
      `${p}Entree:`, `${p}Entree`, `${p} Entrée:`, `${p} Entrée`, `${p} Entree:`, `${p} Entree`
    ]),
    pancakes: getField(payload, [`${p}Pancakes`, `${p} Pancakes`]),
    meat: getField(payload, [`${p}Meat`, `${p} Meat`]),
    eggs: getField(payload, [`${p}Eggs`, `${p} Eggs`, `${p} Eggs...`]),
    coffee: getField(payload, [`${p}Coffee:`, `${p}Coffee`, `${p} Coffee:`, `${p} Coffee`]),
    cream: getField(payload, [`${p}Cream`, `${p} Cream`, `${p} Cream:`]),
    juice: getField(payload, [`${p}Juice:`, `${p}Juice`, `${p} Juice:`, `${p} Juice`]),
    condiments: getField(payload, [`${p}Condiments`, `${p} Condiments`, `${p} Condiments:`])
  }
}

export function hasMealContent(order: ReturnType<typeof normalizeGuest>) {
  return Object.entries(order)
    .filter(([k]) => k !== 'guestNumber')
    .some(([,v]) => String(v || '').trim())
}

export function guest2Declined(payload: any) {
  const value = getField(payload, [
    'No Guest 2',
    'No Guest 2 (I am declining breakfast for Guest 2.)'
  ]).trim().toLowerCase()

  return ['true','yes','1','checked','on','selected'].includes(value)
}
