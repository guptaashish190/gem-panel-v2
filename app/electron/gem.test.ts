import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createLister, searchKeyword, type SearchDeps } from './gem.js'
import {
  applyUnsave,
  deliverMissingFile,
  documentIsLocal,
  fileAction,
  UNSAVED_CAP,
  writeGemPdf,
} from './files.js'
import { applyPredicates, documentNamesFor, predicates, rowMatchesPredicates, type Predicate } from './store.js'
import { UNREACHABLE, type ListingHit, type ParsedTender, type TenderInsert } from './types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46])

function hit(bidNumber: string, listingId: string): ListingHit {
  return { bidNumber, listingId, bidEnd: null, ministry: null, department: null }
}

function parsed(): ParsedTender {
  return {
    bidEnd: '08-10-2026',
    offerValidity: '90 (Days)',
    ministryOrState: 'Ministry of Defence',
    department: 'Department of Military Affairs',
    buyerEmail: null,
    hodEmail: null,
    evaluationMethod: 'Total value wise evaluation',
    typeOfBid: null,
    bidToRa: null,
    raQualificationRule: null,
    paymentTimelineDays: 15,
    bidderDocumentsShown: null,
    requiredDocumentNames: ['Experience Criteria'],
    mse: true,
    mii: null,
    l1PlusPercent: null,
    quantityPercent: null,
    emdRequired: true,
    emdAmount: 5000,
    epbgRequired: null,
    epbgPercentage: null,
    epbgMonths: null,
    beneficiaryName: null,
    products: [],
  }
}

function deps(over: Partial<SearchDeps> = {}): SearchDeps {
  return {
    pagesSearched: async () => 0,
    setPagesSearched: async () => undefined,
    listPage: async () => [hit('GEM/2026/B/1', 'listing-1')],
    downloadPdf: async () => pdfBytes,
    hasBid: async () => false,
    unsavedCount: async () => 0,
    savePdf: async () => undefined,
    removePdf: async () => undefined,
    parsePdf: async () => parsed(),
    insertTender: async () => undefined,
    ...over,
  }
}

async function waitFor(check: () => boolean): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > 2000) throw new Error('timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('search reports fetching, then downloading, then each bid stage', async () => {
  const events: string[] = []
  await searchKeyword(
    deps({
      onProgress: (event) => {
        if (event.kind === 'phase') events.push(event.phase)
        else if (event.kind === 'bid') events.push(`${event.status}:${event.bidNumber}`)
      },
    }),
    'gloves',
    1,
  )
  assert.deepEqual(events, [
    'fetching',
    'downloading',
    'downloading:GEM/2026/B/1',
    'analyzing:GEM/2026/B/1',
    'downloaded:GEM/2026/B/1',
  ])
})

test('failed download keeps the bid as failed', async () => {
  const events: string[] = []
  await searchKeyword(
    deps({
      downloadPdf: async () => {
        throw new Error('download failed')
      },
      onProgress: (event) => {
        if (event.kind === 'bid') events.push(event.status)
      },
    }),
    'gloves',
    1,
  )
  assert.deepEqual(events, ['downloading', 'failed'])
})

test('known bid is shown as downloaded and is not downloaded again', async () => {
  const events: string[] = []
  let downloads = 0
  await searchKeyword(
    deps({
      hasBid: async () => true,
      downloadPdf: async () => {
        downloads += 1
        return pdfBytes
      },
      onProgress: (event) => {
        if (event.kind === 'bid') events.push(event.status)
      },
    }),
    'gloves',
    1,
  )
  assert.deepEqual(events, ['downloaded'])
  assert.equal(downloads, 0)
})

test('known bid is not downloaded', async () => {
  let downloads = 0
  let inserts = 0
  await searchKeyword(
    deps({
      hasBid: async (bidNumber) => bidNumber === 'GEM/2026/B/1',
      downloadPdf: async () => {
        downloads += 1
        return pdfBytes
      },
      insertTender: async () => {
        inserts += 1
      },
    }),
    'gloves',
    1,
  )
  assert.equal(downloads, 0)
  assert.equal(inserts, 0)
})

test('new bid is stored only after the pdf is saved and parsed', async () => {
  const order: string[] = []
  let inserted: TenderInsert | undefined
  const seen: string[] = []
  await searchKeyword(
    deps({
      savePdf: async () => {
        order.push('save')
      },
      parsePdf: async () => {
        order.push('parse')
        return parsed()
      },
      insertTender: async (row) => {
        order.push('insert')
        inserted = row
      },
      onRow: (row) => {
        seen.push(row.bidNumber)
      },
    }),
    'gloves',
    1,
  )
  assert.deepEqual(order, ['save', 'parse', 'insert'])
  assert.equal(inserted?.listingId, 'listing-1')
  assert.equal(inserted?.bidNumber, 'GEM/2026/B/1')
  assert.equal(Object.hasOwn(inserted ?? {}, 'path'), false)
  assert.equal(JSON.stringify(inserted).includes('gem.pdf'), false)
  assert.deepEqual(seen, ['GEM/2026/B/1'])
})

test('failed download leaves no row', async () => {
  let saves = 0
  let inserts = 0
  await searchKeyword(
    deps({
      downloadPdf: async () => {
        throw new Error('download failed')
      },
      savePdf: async () => {
        saves += 1
      },
      insertTender: async () => {
        inserts += 1
      },
    }),
    'gloves',
    1,
  )
  assert.equal(saves, 0)
  assert.equal(inserts, 0)
})

test('failed parse leaves no row', async () => {
  let removed = 0
  let inserts = 0
  await searchKeyword(
    deps({
      parsePdf: async () => {
        throw new Error('unreadable')
      },
      removePdf: async () => {
        removed += 1
      },
      insertTender: async () => {
        inserts += 1
      },
    }),
    'gloves',
    1,
  )
  assert.equal(removed, 1)
  assert.equal(inserts, 0)
})

test('a failed insert removes the pdf and still advances the cursor', async () => {
  let removed = 0
  let cursor = 0
  await searchKeyword(
    deps({
      pagesSearched: async () => cursor,
      setPagesSearched: async (_keyword, count) => {
        cursor = count
      },
      removePdf: async () => {
        removed += 1
      },
      insertTender: async () => {
        throw new Error('insert failed')
      },
    }),
    'gloves',
    1,
  )
  assert.equal(removed, 1)
  assert.equal(cursor, 1)
})

test('a failed download still advances the page cursor', async () => {
  let cursor = 0
  await searchKeyword(
    deps({
      pagesSearched: async () => cursor,
      setPagesSearched: async (_keyword, count) => {
        cursor = count
      },
      downloadPdf: async () => {
        throw new Error('download failed')
      },
    }),
    'gloves',
    1,
  )
  assert.equal(cursor, 1)
})

test('cap full skips the download and leaves no row', async () => {
  let downloads = 0
  let inserts = 0
  await searchKeyword(
    deps({
      unsavedCount: async () => UNSAVED_CAP,
      downloadPdf: async () => {
        downloads += 1
        return pdfBytes
      },
      insertTender: async () => {
        inserts += 1
      },
    }),
    'gloves',
    1,
  )
  assert.equal(downloads, 0)
  assert.equal(inserts, 0)
})

test('cap full does not delete another unsaved pdf', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gem-cap-'))
  await writeGemPdf(root, 'GEM/2026/B/9', pdfBytes)
  const kept = path.join(root, 'GEM-2026-B-9', 'documents', 'gem.pdf')
  let downloads = 0
  await searchKeyword(
    deps({
      unsavedCount: async () => UNSAVED_CAP,
      downloadPdf: async () => {
        downloads += 1
        return pdfBytes
      },
    }),
    'gloves',
    1,
  )
  assert.equal(downloads, 0)
  assert.equal(readFileSync(kept).length, pdfBytes.length)
})

test('only free unsaved slots are downloaded', async () => {
  let downloads = 0
  await searchKeyword(
    deps({
      cap: 1000,
      unsavedCount: async () => 999,
      listPage: async () =>
        Array.from({ length: 5 }, (_item, index) => hit(`GEM/2026/B/${index}`, `id-${index}`)),
      downloadPdf: async () => {
        downloads += 1
        return pdfBytes
      },
    }),
    'gloves',
    1,
  )
  assert.equal(downloads, 1)
})

test('download uses the listing id', async () => {
  let listingId = ''
  await searchKeyword(
    deps({
      listPage: async () => [hit('GEM/2026/B/1', 'listing-9')],
      downloadPdf: async (id) => {
        listingId = id
        return pdfBytes
      },
    }),
    'gloves',
    1,
  )
  assert.equal(listingId, 'listing-9')
})

test('a parsed row appears before the next pdf finishes', async () => {
  let releaseSecond: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })
  const seen: string[] = []
  const done = searchKeyword(
    deps({
      listPage: async () => [hit('GEM/2026/B/1', 'id1'), hit('GEM/2026/B/2', 'id2')],
      downloadPdf: async (id) => {
        if (id === 'id2') await gate
        return pdfBytes
      },
      onRow: (row) => {
        seen.push(row.bidNumber)
      },
    }),
    'gloves',
    1,
  )
  await waitFor(() => seen.includes('GEM/2026/B/1'))
  assert.deepEqual(seen, ['GEM/2026/B/1'])
  releaseSecond()
  await done
  assert.deepEqual(seen, ['GEM/2026/B/1', 'GEM/2026/B/2'])
})

test('the next listing page is requested while earlier downloads are still running', async () => {
  let releaseFirst: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let firstFinished = false
  let sawPage2 = false
  let overlapped = false
  const done = searchKeyword(
    deps({
      listPage: async (_keyword, page) => {
        if (page === 2) {
          sawPage2 = true
          overlapped = !firstFinished
        }
        return [hit(`GEM/2026/B/${page}`, `id${page}`)]
      },
      downloadPdf: async (id) => {
        if (id === 'id1') {
          await held
          firstFinished = true
        }
        return pdfBytes
      },
    }),
    'gloves',
    2,
  )
  await waitFor(() => sawPage2)
  releaseFirst()
  await done
  assert.equal(overlapped, true)
})

test('a fetch starts at the first page even when later pages were already searched', async () => {
  const pages: number[] = []
  let cursor = 4
  await searchKeyword(
    deps({
      pagesSearched: async () => cursor,
      setPagesSearched: async (_keyword, count) => {
        cursor = count
      },
      listPage: async (_keyword, page) => {
        pages.push(page)
        return []
      },
    }),
    'gloves',
    3,
  )
  assert.deepEqual(pages, [1, 2, 3])
  assert.equal(cursor, 3)
})

test('a fetch stops when the listing page is the last one', async () => {
  const pages: number[] = []
  const events: boolean[] = []
  await searchKeyword(
    deps({
      listPage: async (_keyword, page) => {
        pages.push(page)
        return { hits: [hit(`GEM/2026/B/${page}`, `id${page}`)], last: page === 2 }
      },
      onProgress: (event) => {
        if (event.kind === 'pages') events.push(event.last)
      },
    }),
    'gloves',
    5,
  )
  assert.deepEqual(pages, [1, 2])
  assert.deepEqual(events, [true])
})

test('fetch next page reads one page after the cursor', async () => {
  const pages: number[] = []
  let cursor = 4
  await searchKeyword(
    deps({
      pagesSearched: async () => cursor,
      setPagesSearched: async (_keyword, count) => {
        cursor = count
      },
      listPage: async (_keyword, page) => {
        pages.push(page)
        if (page === 6) throw new Error('stop')
        return []
      },
    }),
    'gloves',
    3,
    'next',
  )
  assert.deepEqual(pages, [5])
  assert.equal(cursor, 5)
})

test('missing file downloads the stored bytes and does not call GeM', async () => {
  const stored = Uint8Array.from([4, 5, 6])
  let written: Uint8Array | null = null
  let gemCalls = 0
  const ok = await deliverMissingFile({
    storedKey: 'GEM-2026-B-1/gem.pdf',
    readStored: async (key) => {
      assert.equal(key, 'GEM-2026-B-1/gem.pdf')
      return stored
    },
    writeLocal: async (bytes) => {
      written = bytes
    },
    downloadFromGem: async () => {
      gemCalls += 1
      return Uint8Array.from([9])
    },
  })
  assert.equal(ok, true)
  assert.equal(gemCalls, 0)
  assert.deepEqual(written, stored)
  assert.equal(fileAction(false, true), 'download')
  assert.equal(fileAction(true, true), 'ready')
  assert.equal(fileAction(false, false), 'upload')
})

test('a failed stored download leaves the file action as download', async () => {
  let wrote = false
  const ok = await deliverMissingFile({
    storedKey: 'GEM-2026-B-1/gem.pdf',
    readStored: async () => {
      throw new Error('unavailable')
    },
    writeLocal: async () => {
      wrote = true
    },
    downloadFromGem: async () => Uint8Array.from([1]),
  })
  assert.equal(ok, false)
  assert.equal(wrote, false)
})

test('unsave when the cap is full deletes that local pdf and keeps the row', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gem-unsave-'))
  const savedBid = 'GEM/2026/B/1'
  await writeGemPdf(root, savedBid, pdfBytes)
  await Promise.all(
    Array.from({ length: UNSAVED_CAP }, (_item, index) => writeGemPdf(root, `OTHER/${index}`, pdfBytes)),
  )
  const calls: string[] = []
  let saved = [savedBid]
  await applyUnsave(root, savedBid, {
    setSaved: async (_bidNumber, value) => {
      calls.push(value ? 'saved' : 'unsaved')
      saved = value ? [savedBid] : []
    },
    savedBidNumbers: async () => saved,
  })
  assert.deepEqual(calls, ['unsaved'])
  assert.equal(await documentIsLocal(root, savedBid, 'GeM PDF'), false)
  assert.equal(await documentIsLocal(root, 'OTHER/0', 'GeM PDF'), true)
})

test('unsave keeps the local pdf when the cap has room', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gem-keep-'))
  const savedBid = 'GEM/2026/B/2'
  await writeGemPdf(root, savedBid, pdfBytes)
  await applyUnsave(root, savedBid, {
    setSaved: async () => undefined,
    savedBidNumbers: async () => [],
  })
  assert.equal(await documentIsLocal(root, savedBid, 'GeM PDF'), true)
})

test('filters show only matching stored rows', () => {
  const rows = [
    {
      bid_number: 'A',
      ministry_or_state: 'Ministry of Defence',
      evaluation_method: 'Total value wise evaluation',
      mse: true,
      emd_required: true,
      saved: true,
      status: null,
    },
    {
      bid_number: 'B',
      ministry_or_state: 'Gujarat',
      evaluation_method: 'Item wise evaluation',
      mse: false,
      emd_required: false,
      saved: false,
      status: 'Bid Participated',
    },
    {
      bid_number: 'C',
      ministry_or_state: 'Ministry of Defence',
      evaluation_method: 'Total value wise evaluation',
      mse: true,
      emd_required: false,
      saved: true,
      status: 'Tender Completed',
    },
  ]
  const shown = (preds: Predicate[]) =>
    rows.filter((row) => rowMatchesPredicates(row, preds)).map((row) => row.bid_number)
  assert.deepEqual(shown(predicates('search', { ministryOrState: 'Defence' })), ['A', 'C'])
  assert.deepEqual(shown(predicates('search', { evaluationMethod: 'Item wise' })), ['B'])
  assert.deepEqual(shown(predicates('search', { mse: true })), ['A', 'C'])
  assert.deepEqual(shown(predicates('search', { emd: false })), ['B', 'C'])
  assert.deepEqual(shown(predicates('saved', { mse: true })), ['A', 'C'])
  assert.deepEqual(shown(predicates('filled', {})), ['B', 'C'])
})

test('screen copy does not name records infrastructure', () => {
  const sources = [
    '../src/App.tsx',
    '../src/SettingsPanel.tsx',
    '../src/TemplateDialog.tsx',
    '../src/TenderWindow.tsx',
    '../src/main.tsx',
    '../src/app.css',
  ].map((relative) =>
    readFileSync(path.join(here, relative), 'utf8'),
  )
  const forbidden = /\b(supabase|machines?|folders?|sync|database|storage)\b/i
  for (const source of sources) assert.equal(forbidden.test(source), false)
  assert.equal(UNREACHABLE, 'the panel cannot reach its records')
  assert.equal(forbidden.test(UNREACHABLE), false)
})

test('fetch has no fixed pause', () => {
  const source = readFileSync(path.join(here, '../electron/gem.ts'), 'utf8')
  assert.equal(/setTimeout|setInterval|sleep\(/.test(source), false)
})

test('downloads run four at a time', async () => {
  let current = 0
  let max = 0
  await searchKeyword(
    deps({
      listPage: async () => Array.from({ length: 6 }, (_item, index) => hit(`GEM/2026/B/${index}`, `id-${index}`)),
      downloadPdf: async () => {
        current += 1
        max = Math.max(max, current)
        await new Promise((resolve) => setTimeout(resolve, 30))
        current -= 1
        return pdfBytes
      },
    }),
    'gloves',
    1,
  )
  assert.equal(max, 4)
})

test('listing continues after page one and does not download during that call', async () => {
  const calls: { url: string; body: string }[] = []
  const lister = createLister(async (input, init) => {
    const url = String(input)
    const raw = init?.body
    calls.push({ url, body: typeof raw === 'string' ? raw : raw instanceof URLSearchParams ? raw.toString() : '' })
    if (url.endsWith('/all-bids')) {
      return new Response('<html>', { headers: { 'set-cookie': 'csrf_gem_cookie=token; Path=/' } })
    }
    return Response.json({
      code: 200,
      response: {
        response: {
          docs: [
            {
              b_bid_number: ['GEM/2026/B/1'],
              b_id: '99',
              final_end_date_sort: '2026-10-08T15:00:00Z',
              ba_official_details_minName: 'Ministry of Defence',
              ba_official_details_deptName: 'Department of Military Affairs',
              ba_official_details_orgName: 'Leave this out',
            },
          ],
        },
      },
    })
  }, 'https://bidplus.gem.gov.in')
  const first = await lister.listPage('gloves', 1)
  await lister.listPage('gloves', 2)
  assert.equal(first.hits[0]?.listingId, '99')
  assert.equal(first.hits[0]?.bidNumber, 'GEM/2026/B/1')
  assert.equal(first.hits[0]?.ministry, 'Ministry of Defence')
  assert.equal(first.last, false)
  assert.equal(JSON.stringify(first.hits[0]).includes('Leave this out'), false)
  const posts = calls.filter((call) => call.url.endsWith('/all-bids-data'))
  assert.equal(posts.length, 2)
  const pageOne = JSON.parse(new URLSearchParams(posts[0]?.body).get('payload') ?? '{}') as {
    page?: number
    param: { searchBid: string; searchType: string }
    filter: { bidStatusType: string }
  }
  const pageTwo = JSON.parse(new URLSearchParams(posts[1]?.body).get('payload') ?? '{}') as { page?: number }
  assert.equal(pageOne.param.searchBid, 'gloves')
  assert.equal(pageOne.param.searchType, 'fullText')
  assert.equal(pageOne.filter.bidStatusType, 'ongoing_bids')
  assert.equal(pageOne.page, undefined)
  assert.equal(pageTwo.page, 2)
  assert.equal(new URLSearchParams(posts[1]?.body).get('csrf_bd_gem_nk'), 'token')
  assert.equal(calls.some((call) => call.url.includes('showbidDocument') || call.url.includes('showradocumentPdf')), false)
})

test('a listing page that includes the final bid is the last page', async () => {
  const lister = createLister(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/all-bids')) {
      return new Response('', { headers: { 'set-cookie': 'csrf_gem_cookie=token' } })
    }
    const raw = init?.body
    const body = typeof raw === 'string' ? raw : raw instanceof URLSearchParams ? raw.toString() : ''
    const payload = JSON.parse(new URLSearchParams(body).get('payload') ?? '{}') as {
      page?: number
    }
    const page = payload.page ?? 1
    if (page === 1) {
      return Response.json({
        code: 200,
        response: { response: { numFound: 12, start: 0, docs: [{ b_bid_number: 'GEM/2026/B/1', b_id: '1' }] } },
      })
    }
    if (page === 2) {
      return Response.json({
        code: 200,
        response: {
          response: {
            numFound: 12,
            start: 10,
            docs: [
              { b_bid_number: 'GEM/2026/B/2', b_id: '2' },
              { b_bid_number: 'GEM/2026/B/3', b_id: '3' },
            ],
          },
        },
      })
    }
    return Response.json({ code: 200, response: { response: { numFound: 12, start: 20, docs: [] } } })
  }, 'https://bidplus.gem.gov.in')
  const first = await lister.listPage('gloves', 1)
  const second = await lister.listPage('gloves', 2)
  const third = await lister.listPage('gloves', 3)
  assert.equal(first.last, false)
  assert.equal(second.last, true)
  assert.equal(third.last, true)
})

test('pdf download tries the bid document and then the alternate', async () => {
  const urls: string[] = []
  const lister = createLister(async (input) => {
    const url = String(input)
    urls.push(url)
    if (url.endsWith('/all-bids')) {
      return new Response('', { headers: { 'set-cookie': 'csrf_gem_cookie=token' } })
    }
    if (url.includes('/showbidDocument/')) return new Response('<html>', { headers: { 'content-type': 'text/html' } })
    if (url.includes('/showradocumentPdf/')) {
      return new Response(pdfBytes, { headers: { 'content-type': 'application/octet-stream' } })
    }
    return new Response('no', { status: 404 })
  }, 'https://bidplus.gem.gov.in')
  const bytes = await lister.downloadPdf('99')
  assert.deepEqual(bytes, pdfBytes)
  assert.equal(urls.some((url) => url.endsWith('/showbidDocument/99')), true)
  assert.equal(urls.some((url) => url.endsWith('/showradocumentPdf/99')), true)
})

test('stored documents are the gem pdf, the printed names, the contract, and the crac', () => {
  assert.deepEqual(documentNamesFor(['Experience Criteria', 'Contract']), [
    'GeM PDF',
    'Experience Criteria',
    'Contract',
    'CRAC',
  ])
})

test('list queries filter on the indexed columns', () => {
  const calls: string[] = []
  const query = {
    eq(column: string, value: string | boolean) {
      calls.push(`eq ${column} ${String(value)}`)
      return this
    },
    ilike(column: string, value: string) {
      calls.push(`ilike ${column} ${value}`)
      return this
    },
    not(column: string, operator: 'is', value: null) {
      calls.push(`not ${column} ${operator} ${String(value)}`)
      return this
    },
  }
  applyPredicates(
    query,
    predicates('saved', {
      ministryOrState: 'Defence',
      evaluationMethod: 'Total',
      mse: true,
      emd: false,
    }),
  )
  assert.deepEqual(calls, [
    'eq saved true',
    'ilike ministry_or_state %Defence%',
    'ilike evaluation_method %Total%',
    'eq mse true',
    'eq emd_required false',
  ])
  calls.length = 0
  applyPredicates(query, predicates('filled', {}))
  assert.deepEqual(calls, ['not status is null'])
})

test('the app package is the spine stack', () => {
  const pkg = JSON.parse(readFileSync(path.join(here, '../package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  assert.equal(pkg.dependencies.react, '19.3.0')
  assert.equal(pkg.dependencies['pdfjs-dist'], '6.4.299')
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.117.3')
  assert.equal(pkg.devDependencies.electron, '44.7.0')
  assert.equal(pkg.devDependencies.vite, '8.3.3')
  assert.equal(pkg.devDependencies.typescript, '7.0.2')
  assert.equal(pkg.dependencies.next, undefined)
  assert.equal(pkg.dependencies['sql.js'], undefined)
})
