import { useCallback, useEffect, useRef, useState } from 'react'
import type { FetchProgress, Filters, ScreenName as StoredScreen, Summary, TenderStatus } from './panel'
import { SettingsPanel } from './SettingsPanel'
import { statusTone } from './status'

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

type Picks = {
  ministry: string[] | null
  evaluation: string[] | null
  mse: string[] | null
  emd: string[] | null
}

const EMPTY_PICKS: Picks = {
  ministry: null,
  evaluation: null,
  mse: null,
  emd: null,
}

function buyer(row: Summary): string {
  const parts = [row.ministryOrState, row.department].filter((part) => part)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function mseValue(row: Pick<Summary, 'mse'>): string {
  if (row.mse === true) return 'Yes'
  if (row.mse === false) return 'No'
  return '—'
}

function emdLabel(row: Pick<Summary, 'emdRequired' | 'emdAmount'>): string {
  if (row.emdRequired === false) return 'Not required'
  if (row.emdAmount != null) return money(row.emdAmount)
  if (row.emdRequired === true) return 'Required'
  return '—'
}

function money(amount: number | null): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function ministryValue(row: Summary): string {
  return row.ministryOrState?.trim() || '—'
}

function evaluationValue(row: Summary): string {
  const method = row.evaluationMethod?.toLowerCase() ?? ''
  if (method.includes('item')) return 'Item wise'
  if (method.includes('total')) return 'Total Value wise'
  return row.evaluationMethod?.trim() || '—'
}

function listedOptions(rows: Summary[], value: (row: Summary) => string): string[] {
  return [...new Set(rows.map(value))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
  )
}

function allows(selected: string[] | null, value: string | null): boolean {
  if (selected == null) return true
  return value != null && selected.includes(value)
}

type LiveBid = {
  bidNumber: string
  bidEnd: string | null
  ministryOrState: string | null
  department: string | null
  status: 'downloading' | 'analyzing' | 'downloaded' | 'failed'
}

type FetchStatus = 'Downloading' | 'Analyzing' | 'Downloaded' | 'Failed'

type Shown = Summary & { fetchStatus: FetchStatus; pending: boolean }

function fetchStatus(status: LiveBid['status'] | undefined): FetchStatus {
  if (status === 'downloading') return 'Downloading'
  if (status === 'analyzing') return 'Analyzing'
  if (status === 'failed') return 'Failed'
  return 'Downloaded'
}

function matchesFilters(row: Summary, picks: Picks): boolean {
  return (
    allows(picks.ministry, ministryValue(row)) &&
    allows(picks.evaluation, evaluationValue(row)) &&
    allows(picks.mse, mseValue(row)) &&
    allows(picks.emd, emdLabel(row))
  )
}

function matchesProduct(row: Summary, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return row.productNames.some((name) => name.toLowerCase().includes(needle))
}

function matchesBid(row: Summary, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return row.bidNumber.toLowerCase().includes(needle)
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

type RowMenuState = {
  x: number
  y: number
  bidNumber: string
  saved: boolean
  pdf: Summary['pdf']
  waiting: boolean
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

  const listRequest = useRef(0)

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
    return () => {
      stopDone()
      stopProgress()
    }
  }, [])

  useEffect(() => {
    setRowMenu(null)
  }, [screen])

  useEffect(() => {
    if (blocked !== null || !window.panel || screen === 'settings') return
    void refresh(screen)
    return window.panel.onRow(() => {
      void refresh(screen)
    })
  }, [blocked, screen, refresh])

  useEffect(() => {
    if (blocked !== null || !window.panel) return
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
  }, [blocked])

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

  return (
    <div className="app">
      {blocked ? <p className="banner">{blocked}</p> : null}
      {blocked === null ? (
        <div className="screen">
          <header className="mast">
            <div className="title-block">
              <h1>GeM Tender Panel</h1>
              <p className="sub">{current.sub}</p>
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

          <section className="block">
            <h2>{current.heading}</h2>
            {poolCount === 0 ? <p className="empty">No tenders yet.</p> : null}
            {poolCount > 0 && listed.length === 0 ? <p className="empty">No tenders match.</p> : null}
            {listed.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="idx">#</th>
                      <th>Bid</th>
                      <th>Status</th>
                      <th>Fetch</th>
                      <th>Closes</th>
                      <th>Buyer</th>
                      <th>Eval</th>
                      <th>MSE</th>
                      <th>EMD</th>
                      <th className="num">Products</th>
                      {screen === 'filled' ? <th>Files</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {listed.map((row, index) => {
                      const failed = row.fetchStatus === 'Failed'
                      const waiting = failed || (row.pending && row.fetchStatus !== 'Downloaded')
                      return (
                      <tr
                        key={row.bidNumber}
                        className={[waiting ? 'pending' : '', failed ? 'fail' : '', row.saved ? 'saved' : '', !waiting && row.status ? `tone-${statusTone(row.status)}` : '', !failed && !row.pending && row.pdf !== 'ready' ? 'warn' : ''].filter(Boolean).join(' ')}
                        tabIndex={waiting ? -1 : 0}
                        onClick={() => {
                          if (!waiting) openTenderWindow(row.bidNumber)
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setRowMenu({
                            x: event.clientX,
                            y: event.clientY,
                            bidNumber: row.bidNumber,
                            saved: row.saved,
                            pdf: row.pdf,
                            waiting,
                          })
                        }}
                        onKeyDown={(event) => {
                          if (waiting || event.target !== event.currentTarget) return
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          openTenderWindow(row.bidNumber)
                        }}
                      >
                        <td className="idx">{index + 1}</td>
                        <td className="bid">{row.bidNumber}</td>
                        <td className="status">
                          <StatusMark status={row.status} />
                        </td>
                        <td className={failed ? 'status fail' : waiting ? 'status live' : 'status'}>{row.fetchStatus}</td>
                        <td>{row.bidEnd || '—'}</td>
                        <td>{buyer(row)}</td>
                        <td>{evaluationValue(row)}</td>
                        <td>{mseValue(row)}</td>
                        <td className={row.emdRequired ? 'warn-text' : ''}>{emdLabel(row)}</td>
                        <td className="num">{row.pending ? '—' : row.productCount}</td>
                        {screen === 'filled' ? (
                          <td className="muted">{row.uploadedFiles.join(', ') || '—'}</td>
                        ) : null}
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {screen === 'search' && listKeyword ? (
              <div className="list-more">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void onFetchNext()}
                  disabled={fetching || !hasMore}
                >
                  Fetch next page
                </button>
              </div>
            ) : null}
          </section>
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

function RowMenu({
  menu,
  onClose,
  onOpenPdf,
  onSavePdf,
  onDelete,
}: {
  menu: RowMenuState
  onClose: () => void
  onOpenPdf: () => void
  onSavePdf: () => void
  onDelete?: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 168))
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - (onDelete ? 128 : 92)))

  useEffect(() => {
    const first = box.current?.querySelector('button:not(:disabled)')
    if (first instanceof HTMLButtonElement) first.focus({ preventScroll: true })
    function onPointer(event: MouseEvent) {
      if (box.current?.contains(event.target as Node)) return
      onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={box}
      className="row-menu"
      role="menu"
      style={{ left, top }}
      aria-label={menu.bidNumber}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={menu.waiting || menu.pdf === 'upload'}
        onClick={() => {
          onClose()
          onOpenPdf()
        }}
      >
        Open PDF
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={menu.waiting}
        onClick={() => {
          onClose()
          onSavePdf()
        }}
      >
        {menu.saved ? 'Unsave' : 'Save PDF'}
      </button>
      {onDelete ? (
        <button
          type="button"
          role="menuitem"
          className="danger"
          disabled={menu.waiting}
          onClick={() => {
            onClose()
            onDelete()
          }}
        >
          Delete
        </button>
      ) : null}
    </div>
  )
}

function ExcelFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[] | null
  onChange: (next: string[] | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const chosen = selected ?? options
  const allOn = options.length === 0 || options.every((option) => chosen.includes(option))
  const shown = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))
  const caption = allOn ? label : chosen.length === 1 ? chosen[0] : chosen.length === 0 ? 'None' : `${chosen.length} selected`

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle(value: string) {
    const next = new Set(chosen)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    const picked = options.filter((option) => next.has(option))
    onChange(picked.length === options.length ? null : picked)
  }

  return (
    <div className="excel" ref={box}>
      <button
        type="button"
        className={allOn ? 'excel-btn' : 'excel-btn on'}
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setQuery('')
          setOpen((value) => !value)
        }}
      >
        <span>{caption}</span>
        <i className="caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="excel-menu" role="group" aria-label={label}>
          <input
            value={query}
            placeholder="Search"
            aria-label={`Search ${label}`}
            onChange={(event) => setQuery(event.target.value)}
          />
          <label className="excel-option">
            <input
              type="checkbox"
              checked={allOn}
              ref={(input) => {
                if (input) input.indeterminate = !allOn && chosen.length > 0
              }}
              onChange={() => onChange(allOn ? [] : null)}
            />
            <span>Select all</span>
          </label>
          {shown.map((option) => (
            <label key={option} className="excel-option">
              <input type="checkbox" checked={chosen.includes(option)} onChange={() => toggle(option)} />
              <span>{option}</span>
            </label>
          ))}
          {shown.length === 0 ? <p className="excel-empty">No matching values</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function StatusMark({ status }: { status: TenderStatus | null }) {
  if (!status) return '—'
  return <span className={`status-pill ${statusTone(status)}`}>{status}</span>
}

function Stat({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className="stat">
      <div className={warn ? 'stat-value warn' : 'stat-value'}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
