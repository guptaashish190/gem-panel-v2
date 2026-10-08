import { UNSAVED_CAP } from './files.js'
import type { ListingHit, ParsedTender, TenderInsert, TenderSummary } from './types.js'

const BASE = 'https://bidplus.gem.gov.in'

export type SearchDeps = {
  pagesSearched: (keyword: string) => Promise<number>
  setPagesSearched: (keyword: string, pages: number) => Promise<void>
  listPage: (keyword: string, page: number) => Promise<ListingHit[]>
  downloadPdf: (listingId: string) => Promise<Uint8Array>
  hasBid: (bidNumber: string) => Promise<boolean>
  unsavedCount: () => Promise<number>
  savePdf: (bidNumber: string, bytes: Uint8Array) => Promise<void>
  removePdf: (bidNumber: string) => Promise<void>
  parsePdf: (bytes: Uint8Array) => Promise<ParsedTender>
  insertTender: (row: TenderInsert) => Promise<void>
  onRow?: (row: TenderSummary) => void
  cap?: number
}

function asText(value: unknown): string | null {
  if (Array.isArray(value)) return asText(value[0])
  if (value == null || value === '') return null
  return String(value)
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

function rememberCookies(existing: Map<string, string>, response: Response): Map<string, string> {
  const next = new Map(existing)
  const headers = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  for (const header of headers) {
    const pair = header.split(';')[0] ?? ''
    const eq = pair.indexOf('=')
    if (eq < 1) continue
    next.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
  return next
}

export function createLister(fetchImpl: typeof fetch = fetch, base = BASE) {
  let cookies = new Map<string, string>()

  async function request(url: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers)
    if (cookies.size > 0) {
      headers.set('cookie', [...cookies].map(([key, value]) => `${key}=${value}`).join('; '))
    }
    const response = await fetchImpl(url, { ...init, headers })
    cookies = rememberCookies(cookies, response)
    return response
  }

  async function readPdf(url: string): Promise<Uint8Array | null> {
    const response = await request(url)
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    const type = response.headers.get('content-type') ?? ''
    if (type.toLowerCase().includes('pdf') || isPdf(bytes)) return bytes
    return null
  }

  return {
    async listPage(keyword: string, page: number): Promise<ListingHit[]> {
      if (!cookies.get('csrf_gem_cookie')) {
        const home = await request(`${base}/all-bids`)
        if (!home.ok) throw new Error(`listing page HTTP ${home.status}`)
        await home.arrayBuffer()
      }
      const payload: Record<string, unknown> = {
        param: { searchBid: keyword, searchType: 'fullText' },
        filter: {
          bidStatusType: 'ongoing_bids',
          byType: 'all',
          highBidValue: '',
          byEndDate: { from: '', to: '' },
          sort: 'Bid-End-Date-Oldest',
        },
      }
      if (page > 1) payload.page = page
      const body = new URLSearchParams({
        payload: JSON.stringify(payload),
        csrf_bd_gem_nk: cookies.get('csrf_gem_cookie') ?? '',
      })
      const response = await request(`${base}/all-bids-data`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          accept: 'application/json, text/javascript, */*; q=0.01',
          'x-requested-with': 'XMLHttpRequest',
          origin: base,
          referer: `${base}/all-bids`,
        },
        body,
      })
      if (!response.ok) throw new Error(`listing HTTP ${response.status}`)
      const json = (await response.json()) as {
        code?: number
        response?: { response?: { docs?: Record<string, unknown>[] } }
      }
      if (json.code != null && json.code !== 200) throw new Error(`listing code ${json.code}`)
      const hits: ListingHit[] = []
      for (const doc of json.response?.response?.docs ?? []) {
        const bidNumber = asText(doc.b_bid_number)
        const listingId = asText(doc.b_id)
        if (!bidNumber || !listingId) continue
        hits.push({
          bidNumber,
          listingId,
          bidEnd: asText(doc.final_end_date_sort),
          ministry: asText(doc.ba_official_details_minName),
          department: asText(doc.ba_official_details_deptName),
        })
      }
      return hits
    },

    async downloadPdf(listingId: string): Promise<Uint8Array> {
      const primary = await readPdf(`${base}/showbidDocument/${encodeURIComponent(listingId)}`)
      if (primary) return primary
      const alternate = await readPdf(`${base}/showradocumentPdf/${encodeURIComponent(listingId)}`)
      if (alternate) return alternate
      throw new Error('not a pdf')
    },
  }
}

type Slots = {
  take: () => boolean
  release: () => void
}

async function ingestOne(deps: SearchDeps, hit: ListingHit, slots: Slots): Promise<'done' | 'retry'> {
  if (!hit.bidNumber || !hit.listingId) return 'done'
  if (await deps.hasBid(hit.bidNumber)) return 'done'
  if (!slots.take()) return 'retry'
  let bytes: Uint8Array
  try {
    bytes = await deps.downloadPdf(hit.listingId)
  } catch {
    slots.release()
    return 'retry'
  }
  try {
    await deps.savePdf(hit.bidNumber, bytes)
  } catch {
    slots.release()
    return 'retry'
  }
  let parsed: Awaited<ReturnType<SearchDeps['parsePdf']>>
  try {
    parsed = await deps.parsePdf(bytes)
  } catch {
    await deps.removePdf(hit.bidNumber)
    slots.release()
    return 'retry'
  }
  const row: TenderInsert = {
    ...parsed,
    bidNumber: hit.bidNumber,
    listingId: hit.listingId,
    bidEnd: parsed.bidEnd ?? hit.bidEnd,
    ministryOrState: parsed.ministryOrState ?? hit.ministry,
    department: parsed.department ?? hit.department,
  }
  try {
    await deps.insertTender(row)
  } catch {
    await deps.removePdf(hit.bidNumber)
    slots.release()
    return 'retry'
  }
  deps.onRow?.({
    bidNumber: row.bidNumber,
    bidEnd: row.bidEnd,
    ministryOrState: row.ministryOrState,
    department: row.department,
    evaluationMethod: row.evaluationMethod,
    saved: false,
    filled: false,
    uploadedFiles: [],
  })
  return 'done'
}

export async function searchKeyword(deps: SearchDeps, keyword: string, pageCount: number): Promise<void> {
  const start = (await deps.pagesSearched(keyword)) + 1
  const cap = deps.cap ?? UNSAVED_CAP
  let slotsLeft = cap - (await deps.unsavedCount())
  const slots: Slots = {
    take() {
      if (slotsLeft <= 0) return false
      slotsLeft -= 1
      return true
    },
    release() {
      slotsLeft += 1
    },
  }
  const queue: ListingHit[] = []
  const waiters: (() => void)[] = []
  let listingDone = false
  const wake = () => {
    const pending = waiters.splice(0, waiters.length)
    for (const resolve of pending) resolve()
  }
  const idle = () => {
    if (queue.length > 0 || listingDone) return Promise.resolve()
    return new Promise<void>((resolve) => {
      waiters.push(resolve)
    })
  }
  const seen = new Set<string>()
  let retry = false
  const workers = Array.from({ length: 4 }, async () => {
    for (;;) {
      const hit = queue.shift()
      if (!hit) {
        if (listingDone) return
        await idle()
        continue
      }
      if (seen.has(hit.bidNumber)) continue
      seen.add(hit.bidNumber)
      if ((await ingestOne(deps, hit, slots)) === 'retry') retry = true
    }
  })
  let fetched = 0
  for (let offset = 0; offset < pageCount; offset += 1) {
    let hits: ListingHit[]
    try {
      hits = await deps.listPage(keyword, start + offset)
    } catch {
      break
    }
    fetched += 1
    queue.push(...hits)
    wake()
  }
  listingDone = true
  wake()
  await Promise.all(workers)
  if (!retry && fetched > 0) await deps.setPagesSearched(keyword, start + fetched - 1)
}
