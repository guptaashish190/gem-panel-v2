import { UNSAVED_CAP } from './files.js'
import type { FetchProgress, ListingHit, ParsedTender, TenderInsert, TenderSummary } from './types.js'

const BASE = 'https://bidplus.gem.gov.in'

export type ListingPage = {
  hits: ListingHit[]
  last: boolean
}

function pageOf(value: ListingHit[] | ListingPage): ListingPage {
  if (Array.isArray(value)) return { hits: value, last: false }
  return value
}

function countOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function isLastListing(found: unknown, start: unknown, docCount: number): boolean {
  if (docCount === 0) return true
  const total = countOf(found)
  const offset = countOf(start)
  if (total == null || offset == null) return false
  return offset + docCount >= total
}

export type SearchDeps = {
  pagesSearched: (keyword: string) => Promise<number>
  setPagesSearched: (keyword: string, pages: number) => Promise<void>
  listPage: (keyword: string, page: number) => Promise<ListingHit[] | ListingPage>
  downloadPdf: (listingId: string) => Promise<Uint8Array>
  hasBid: (bidNumber: string) => Promise<boolean>
  unsavedCount: () => Promise<number>
  savePdf: (bidNumber: string, bytes: Uint8Array) => Promise<void>
  removePdf: (bidNumber: string) => Promise<void>
  parsePdf: (bytes: Uint8Array) => Promise<ParsedTender>
  insertTender: (row: TenderInsert) => Promise<void>
  onRow?: (row: TenderSummary) => void
  onProgress?: (event: FetchProgress) => void
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
    async listPage(keyword: string, page: number): Promise<ListingPage> {
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
        response?: { response?: { numFound?: unknown; start?: unknown; docs?: Record<string, unknown>[] } }
      }
      if (json.code != null && json.code !== 200) throw new Error(`listing code ${json.code}`)
      const docs = json.response?.response?.docs ?? []
      const hits: ListingHit[] = []
      for (const doc of docs) {
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
      return {
        hits,
        last: isLastListing(json.response?.response?.numFound, json.response?.response?.start, docs.length),
      }
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

function reportBid(deps: SearchDeps, hit: ListingHit, status: 'downloading' | 'analyzing' | 'downloaded' | 'failed'): void {
  deps.onProgress?.({
    kind: 'bid',
    bidNumber: hit.bidNumber,
    bidEnd: hit.bidEnd,
    ministryOrState: hit.ministry,
    department: hit.department,
    status,
  })
}

async function ingestOne(deps: SearchDeps, hit: ListingHit, slots: Slots): Promise<'done' | 'retry'> {
  if (!hit.bidNumber || !hit.listingId) return 'done'
  if (await deps.hasBid(hit.bidNumber)) {
    reportBid(deps, hit, 'downloaded')
    return 'done'
  }
  if (!slots.take()) return 'retry'
  reportBid(deps, hit, 'downloading')
  let bytes: Uint8Array
  try {
    bytes = await deps.downloadPdf(hit.listingId)
  } catch {
    slots.release()
    reportBid(deps, hit, 'failed')
    return 'done'
  }
  try {
    await deps.savePdf(hit.bidNumber, bytes)
  } catch {
    slots.release()
    reportBid(deps, hit, 'failed')
    return 'done'
  }
  reportBid(deps, hit, 'analyzing')
  let parsed: Awaited<ReturnType<SearchDeps['parsePdf']>>
  try {
    parsed = await deps.parsePdf(bytes)
  } catch {
    await deps.removePdf(hit.bidNumber)
    slots.release()
    reportBid(deps, hit, 'failed')
    return 'done'
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
    reportBid(deps, hit, 'failed')
    return 'done'
  }
  deps.onRow?.({
    bidNumber: row.bidNumber,
    bidEnd: row.bidEnd,
    ministryOrState: row.ministryOrState,
    department: row.department,
    evaluationMethod: row.evaluationMethod,
    mse: row.mse,
    l1PlusPercent: row.l1PlusPercent,
    quantityPercent: row.quantityPercent,
    emdRequired: row.emdRequired,
    emdAmount: row.emdAmount,
    productCount: row.products.length,
    productNames: row.products.map((product) => product.name),
    pdf: 'ready',
    saved: false,
    status: null,
    uploadedFiles: [],
  })
  reportBid(deps, hit, 'downloaded')
  return 'done'
}

export async function searchKeyword(
  deps: SearchDeps,
  keyword: string,
  pageCount: number,
  mode: 'slate' | 'next' = 'slate',
): Promise<void> {
  const next = mode === 'next'
  deps.onProgress?.({ kind: 'phase', phase: 'fetching', replace: !next })
  const count = next ? 1 : pageCount
  const start = next ? (await deps.pagesSearched(keyword)) + 1 : 1
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
  let announcedDownload = false
  let reachedEnd = false
  for (let offset = 0; offset < count; offset += 1) {
    let page: ListingPage
    try {
      page = pageOf(await deps.listPage(keyword, start + offset))
    } catch {
      break
    }
    fetched += 1
    if (!announcedDownload) {
      deps.onProgress?.({ kind: 'phase', phase: 'downloading' })
      announcedDownload = true
    }
    queue.push(...page.hits)
    wake()
    if (page.last) {
      reachedEnd = true
      break
    }
  }
  listingDone = true
  wake()
  await Promise.all(workers)
  deps.onProgress?.({ kind: 'pages', last: reachedEnd })
  if (!retry && fetched > 0) await deps.setPagesSearched(keyword, start + fetched - 1)
}
