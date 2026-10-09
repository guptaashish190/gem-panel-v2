import { useCallback, useEffect, useRef, useState } from 'react'
import type { FetchProgress, Filters, ScreenName as StoredScreen, Summary } from './panel'
import { AccountScreen } from './AccountScreen'
import { SettingsPanel } from './SettingsPanel'
import { ExcelFilter } from './components/ExcelFilter'
import { RowMenu, type RowMenuState } from './components/RowMenu'
import { Stat } from './components/Stat'
import { TenderTable, type FetchStatus, type Shown } from './components/TenderTable'
import {
  emdLabel,
  evaluationValue,
  listedOptions,
  matchesBid,
  matchesFilters,
  matchesProduct,
  ministryValue,
  mseValue,
  type Picks,
} from './format'

type ScreenName = StoredScreen | 'all' | 'settings'

const SCREENS: { id: ScreenName; label: string; sub: string; heading: string }[] = [
  { id: 'search', label: 'Search', sub: 'Bids from this search', heading: 'Search' },
  { id: 'all', label: 'All tenders', sub: 'Downloaded bids', heading: 'All tenders' },
  { id: 'saved', label: 'Saved', sub: 'Bids you kept', heading: 'Saved' },
  { id: 'filled', label: 'Tender Status', sub: 'Bids with a status', heading: 'Tender Status' },
  { id: 'settings', label: 'Settings', sub: 'Company and documents', heading: 'Settings' },
]

function storedScreen(screen: ScreenName): StoredScreen {
  if (screen === 'saved' || screen === 'filled') return screen
  return 'search'
}

const EMPTY_FILTERS: Filters = {
  ministryOrState: '',
  evaluationMethod: '',
  mse: null,
  emd: null,
}

const EMPTY_PICKS: Picks = {
  ministry: null,
  evaluation: null,
  mse: null,
  emd: null,
}

type LiveBid = {
  bidNumber: string
  bidEnd: string | null
  ministryOrState: string | null
  department: string | null
  status: 'downloading' | 'analyzing' | 'downloaded' | 'failed'
}

function fetchStatus(status: LiveBid['status'] | undefined): FetchStatus {
  if (status === 'downloading') return 'Downloading'
  if (status === 'analyzing') return 'Analyzing'
  if (status === 'failed') return 'Failed'
  return 'Downloaded'
}

function placeholder(bid: LiveBid): Summary {
  return {
    bidNumber: bid.bidNumber,
    bidEnd: bid.bidEnd,
    ministryOrState: bid.ministryOrState,
    department: bid.department,
    evaluationMethod: null,
    mse: null,
    l1PlusPercent: null,
    quantityPercent: null,
    emdRequired: null,
    emdAmount: null,
    productCount: 0,
    productNames: [],
    pdf: 'download',
    saved: false,
    status: null,
    uploadedFiles: [],
  }
}

function sessionRow(bid: LiveBid, stored: Summary | undefined): Shown {
  if (bid.status === 'downloaded' && stored) {
    return { ...stored, fetchStatus: 'Downloaded', pending: false }
  }
  return {
    ...placeholder(bid),
    fetchStatus: fetchStatus(bid.status),
    pending: bid.status !== 'downloaded',
  }
}

function rememberProgress(event: FetchProgress, current: Map<string, LiveBid>): Map<string, LiveBid> {
  if (event.kind !== 'bid') return current
  const next = new Map(current)
  next.set(event.bidNumber, {
    bidNumber: event.bidNumber,
    bidEnd: event.bidEnd,
    ministryOrState: event.ministryOrState,
    department: event.department,
    status: event.status,
  })
  return next
}

export function App() {
  const [screen, setScreen] = useState<ScreenName>('all')
  const [picks, setPicks] = useState<Picks>(EMPTY_PICKS)
  const [rows, setRows] = useState<Summary[]>([])
  const [keyword, setKeyword] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [bidQuery, setBidQuery] = useState('')
  const [pages, setPages] = useState(1)
  const [fetching, setFetching] = useState(false)
  const [phase, setPhase] = useState<'fetching' | 'downloading' | null>(null)
  const [live, setLive] = useState<Map<string, LiveBid>>(() => new Map())
  const [blocked, setBlocked] = useState<string | null | undefined>(undefined)
  const [counts, setCounts] = useState({ tenders: 0, saved: 0, filled: 0 })
  const [listKeyword, setListKeyword] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null)
  const [account, setAccount] = useState<{ email: string } | null | undefined>(undefined)

  const listRequest = useRef(0)

  const loadAccount = useCallback(async () => {
    const panel = window.panel
    if (!panel) return
    setAccount(await panel.session())
  }, [])

  const refresh = useCallback(async (nextScreen: ScreenName) => {
    if (!window.panel) return
    const request = ++listRequest.current
    const listed = await window.panel.list(storedScreen(nextScreen), EMPTY_FILTERS)
    if (request !== listRequest.current) return
    setRows(listed)
  }, [])

  useEffect(() => {
    if (!window.panel) {
      setBlocked('the panel cannot reach its records')
      setAccount(null)
      return
    }
    void window.panel.reachable().then((result) => {
      setBlocked(result.ok ? null : result.message)
    })
    const stopDone = window.panel.onFetchDone(() => {
      setFetching(false)
      setPhase(null)
      setLive((current) => {
        const next = new Map<string, LiveBid>()
        for (const [id, bid] of current) {
          if (bid.status === 'downloaded' || bid.status === 'failed') next.set(id, bid)
        }
        return next
      })
    })
    const stopProgress = window.panel.onFetchProgress((event) => {
      if (event.kind === 'phase') {
        if (event.phase === 'fetching' && event.replace !== false) setLive(new Map())
        setPhase(event.phase)
        return
      }
      if (event.kind === 'pages') {
        setHasMore(!event.last)
        return
      }
      setLive((current) => rememberProgress(event, current))
    })
    void loadAccount()
    const stopSession = window.panel.onSession(() => {
      void loadAccount()
    })
    return () => {
      stopDone()
      stopProgress()
      stopSession()
    }
  }, [loadAccount])

  useEffect(() => {
    setRowMenu(null)
  }, [screen])

  useEffect(() => {
    if (blocked !== null || !account || !window.panel || screen === 'settings') return
    void refresh(screen)
    return window.panel.onRow(() => {
      void refresh(screen)
    })
  }, [account, blocked, screen, refresh])

  useEffect(() => {
    if (blocked !== null || !account || !window.panel) return
    const panel = window.panel
    let stop = false
    const load = () => {
      void Promise.all([
        panel.list('search', EMPTY_FILTERS),
        panel.list('saved', EMPTY_FILTERS),
        panel.list('filled', EMPTY_FILTERS),
      ]).then(([tenders, saved, filled]) => {
        if (stop) return
        setCounts({ tenders: tenders.length, saved: saved.length, filled: filled.length })
      })
    }
    load()
    const stopRow = panel.onRow(load)
    return () => {
      stop = true
      stopRow()
    }
  }, [account, blocked])

  async function onFetch() {
    if (!window.panel || blocked || !keyword.trim()) return
    const trimmed = keyword.trim()
    setLive(new Map())
    setPicks(EMPTY_PICKS)
    setProductQuery('')
    setBidQuery('')
    setFetching(true)
    setPhase('fetching')
    setHasMore(true)
    const result = await window.panel.fetch(trimmed, pages, 'slate')
    if (!result.started) {
      setFetching(false)
      setPhase(null)
      return
    }
    setListKeyword(trimmed)
  }

  async function onFetchNext() {
    if (!window.panel || blocked || fetching || !hasMore || !listKeyword) return
    setFetching(true)
    setPhase('fetching')
    setHasMore(true)
    const result = await window.panel.fetch(listKeyword, 1, 'next')
    if (!result.started) {
      setFetching(false)
      setPhase(null)
    }
  }

  function openTenderWindow(bidNumber: string) {
    void window.panel?.openWindow(bidNumber)
  }

  function openRowPdf(menu: RowMenuState) {
    const panel = window.panel
    if (!panel || menu.waiting || menu.pdf === 'upload') return
    if (menu.pdf === 'ready') {
      void panel.openLocal(menu.bidNumber, 'GeM PDF')
      return
    }
    void panel.download(menu.bidNumber, 'GeM PDF').then((ok) => {
      if (!ok) return
      void panel.openLocal(menu.bidNumber, 'GeM PDF')
      void refresh(screen)
    })
  }

  function saveRowPdf(menu: RowMenuState) {
    const panel = window.panel
    if (!panel || menu.waiting) return
    void (menu.saved ? panel.unsave(menu.bidNumber) : panel.save(menu.bidNumber)).then(() => {
      void refresh(screen)
    })
  }

  function deleteRow(menu: RowMenuState) {
    const panel = window.panel
    if (!panel?.deleteTender || menu.waiting) return
    const bidNumber = menu.bidNumber
    setRows((current) => current.filter((row) => row.bidNumber !== bidNumber))
    setLive((current) => {
      if (!current.has(bidNumber)) return current
      const next = new Map(current)
      next.delete(bidNumber)
      return next
    })
    void panel.deleteTender(bidNumber).then(
      (ok) => {
        if (!ok) void refresh(screen)
      },
      () => {
        void refresh(screen)
      },
    )
  }

  const storedById = new Map(rows.map((row) => [row.bidNumber, row]))
  const fetched: Shown[] =
    screen === 'search' ? [...live.values()].map((bid) => sessionRow(bid, storedById.get(bid.bidNumber))) : []
  const listed: Shown[] =
    screen === 'search'
      ? fetched.filter(
          (row) =>
            row.fetchStatus === 'Failed' ||
            ((row.pending || matchesFilters(row, picks)) && matchesProduct(row, productQuery) && matchesBid(row, bidQuery)),
        )
      : rows
          .filter((row) => matchesFilters(row, picks) && matchesProduct(row, productQuery) && matchesBid(row, bidQuery))
          .map((row) => ({ ...row, fetchStatus: 'Downloaded' as const, pending: false }))
  const optionRows = screen === 'search' ? fetched : rows
  const ministryOptions = listedOptions(optionRows, ministryValue)
  const evaluationOptions = listedOptions(optionRows, evaluationValue)
  const mseOptions = listedOptions(optionRows, mseValue)
  const emdOptions = listedOptions(optionRows, emdLabel)
  const phaseLabel = phase === 'fetching' ? 'Fetching tenders' : phase === 'downloading' ? 'Downloading tenders' : null
  const poolCount = screen === 'search' ? fetched.length : rows.length
  const current = SCREENS.find((item) => item.id === screen) ?? SCREENS[0]

  if (account === undefined || blocked === undefined) return <div className="app" />
  if (!account) {
    return (
      <div className="app">
        {blocked ? <p className="banner">{blocked}</p> : null}
        <AccountScreen onSignedIn={() => void loadAccount()} />
      </div>
    )
  }

  return (
    <div className="app">
      {blocked ? <p className="banner">{blocked}</p> : null}
      {blocked === null ? (
        <div className="screen">
          <header className="mast">
            <div className="title-block">
              <h1>GeM Tender Panel</h1>
              <p className="sub">{current.sub}</p>
              <p className="account-line">
                <span>{account.email}</span>
                <button type="button" className="btn btn-ghost" onClick={() => void window.panel?.signOut()}>
                  Sign out
                </button>
              </p>
            </div>
            <div className="stats">
              <Stat value={String(counts.tenders)} label="Tenders" />
              <Stat value={String(counts.saved)} label="Saved" />
              <Stat value={String(counts.filled)} label="Status" />
            </div>
          </header>

          <div className="pills">
            {SCREENS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === screen ? 'pill active' : 'pill'}
                onClick={() => {
                  setScreen(item.id)
                  setPicks(EMPTY_PICKS)
                  setProductQuery('')
                  setBidQuery('')
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {screen === 'settings' ? (
            <SettingsPanel />
          ) : (
          <>
          {screen === 'search' ? (
            <div className="search-row">
              <input
                className="grow"
                value={keyword}
                placeholder="Keyword"
                onChange={(event) => setKeyword(event.target.value)}
              />
              <input
                className="pages"
                type="number"
                min={1}
                value={pages}
                aria-label="Pages"
                onChange={(event) => setPages(Math.max(1, Number(event.target.value) || 1))}
              />
              <button type="button" className="btn btn-primary" onClick={() => void onFetch()} disabled={fetching}>
                {phaseLabel ?? (fetching ? 'Fetching tenders' : 'Fetch')}
              </button>
            </div>
          ) : null}
          {screen === 'search' && phaseLabel ? (
            <p className="fetch-status" role="status" aria-live="polite">
              {phaseLabel}
            </p>
          ) : null}

          <div className="filter-row">
            <span className="filter-label">Filter</span>
            <input
              className="grow"
              value={productQuery}
              placeholder="Product"
              aria-label="Product"
              onChange={(event) => setProductQuery(event.target.value)}
            />
            <input
              className="grow"
              value={bidQuery}
              placeholder="Bid number"
              aria-label="Bid number"
              onChange={(event) => setBidQuery(event.target.value)}
            />
            <ExcelFilter
              label="Ministry or state"
              options={ministryOptions}
              selected={picks.ministry}
              onChange={(ministry) => setPicks({ ...picks, ministry })}
            />
            <ExcelFilter
              label="Evaluation"
              options={evaluationOptions}
              selected={picks.evaluation}
              onChange={(evaluation) => setPicks({ ...picks, evaluation })}
            />
            <ExcelFilter
              label="MSE"
              options={mseOptions}
              selected={picks.mse}
              onChange={(mse) => setPicks({ ...picks, mse })}
            />
            <ExcelFilter
              label="EMD"
              options={emdOptions}
              selected={picks.emd}
              onChange={(emd) => setPicks({ ...picks, emd })}
            />
          </div>

          <TenderTable
            heading={current.heading}
            poolCount={poolCount}
            rows={listed}
            showFiles={screen === 'filled'}
            next={
              screen === 'search' && listKeyword
                ? { fetching, hasMore, onFetch: () => void onFetchNext() }
                : null
            }
            onOpen={openTenderWindow}
            onMenu={setRowMenu}
          />
          {rowMenu ? (
            <RowMenu
              menu={rowMenu}
              onClose={() => setRowMenu(null)}
              onOpenPdf={() => openRowPdf(rowMenu)}
              onSavePdf={() => saveRowPdf(rowMenu)}
              onDelete={screen === 'all' ? () => deleteRow(rowMenu) : undefined}
            />
          ) : null}
          </>
          )}
        </div>
      ) : null}
    </div>
  )
}
