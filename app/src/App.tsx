import { useCallback, useEffect, useRef, useState } from 'react'
import type { Filters, ScreenName, Summary, TenderDetail } from './panel'

const SCREENS: { id: ScreenName; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'saved', label: 'Saved' },
  { id: 'filled', label: 'Tender Status' },
]

const EMPTY_FILTERS: Filters = {
  ministryOrState: '',
  evaluationMethod: '',
  mse: null,
  emd: null,
}

function show(value: string | number | boolean | null): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function tri(value: string): boolean | null {
  if (value === 'yes') return true
  if (value === 'no') return false
  return null
}

function triValue(value: boolean | null): string {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return ''
}

export function App() {
  const [screen, setScreen] = useState<ScreenName>('search')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [rows, setRows] = useState<Summary[]>([])
  const [detail, setDetail] = useState<TenderDetail | null>(null)
  const [keyword, setKeyword] = useState('')
  const [pages, setPages] = useState(1)
  const [fetching, setFetching] = useState(false)
  const [blocked, setBlocked] = useState<string | null | undefined>(undefined)

  const listRequest = useRef(0)
  const openRequest = useRef(0)

  const refresh = useCallback(async (nextScreen: ScreenName, nextFilters: Filters) => {
    if (!window.panel) return
    const request = ++listRequest.current
    const listed = await window.panel.list(nextScreen, nextFilters)
    if (request !== listRequest.current) return
    setRows(listed)
  }, [])

  const reloadDetail = useCallback(async (bidNumber: string) => {
    if (!window.panel) return
    const request = ++openRequest.current
    const next = await window.panel.open(bidNumber)
    if (request !== openRequest.current) return
    setDetail(next)
  }, [])

  useEffect(() => {
    if (!window.panel) {
      setBlocked('the panel cannot reach its records')
      return
    }
    void window.panel.reachable().then((result) => {
      setBlocked(result.ok ? null : result.message)
    })
    const stopDone = window.panel.onFetchDone(() => setFetching(false))
    return stopDone
  }, [])

  useEffect(() => {
    if (blocked !== null || !window.panel) return
    void refresh(screen, filters)
    return window.panel.onRow(() => {
      void refresh(screen, filters)
    })
  }, [blocked, screen, filters, refresh])

  async function onFetch() {
    if (!window.panel || blocked) return
    setFetching(true)
    const result = await window.panel.fetch(keyword, pages)
    if (!result.started) setFetching(false)
  }

  async function openBid(bidNumber: string) {
    await reloadDetail(bidNumber)
  }

  const schedule = detail?.products.some((product) => product.scheduleNumber != null) ?? false

  return (
    <div className="app">
      <nav className="rail">
        <h1>GeM Tenders</h1>
        {SCREENS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === screen ? 'active' : ''}
            onClick={() => {
              setScreen(item.id)
              setDetail(null)
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className="main">
        {blocked ? <p className="banner">{blocked}</p> : null}
        {blocked === null && detail ? (
          <article className="detail">
            <div className="detail-head">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  openRequest.current += 1
                  setDetail(null)
                }}
              >
                Back
              </button>
              <h2>{detail.bidNumber}</h2>
              <button
                type="button"
                onClick={() => {
                  const panel = window.panel
                  if (!panel) return
                  void (detail.saved ? panel.unsave(detail.bidNumber) : panel.save(detail.bidNumber)).then(() => {
                    void reloadDetail(detail.bidNumber)
                    void refresh(screen, filters)
                  })
                }}
              >
                {detail.saved ? 'Unsave' : 'Save'}
              </button>
              {detail.filled ? (
                <span className="ready">Filled</span>
              ) : (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    void window.panel?.markFilled(detail.bidNumber)?.then(() => {
                      void reloadDetail(detail.bidNumber)
                      void refresh(screen, filters)
                    })
                  }}
                >
                  Mark filled
                </button>
              )}
            </div>
            <dl className="fields">
              <Field label="Bid end" value={show(detail.bidEnd)} />
              <Field label="Offer validity" value={show(detail.offerValidity)} />
              <Field label="Ministry or state" value={show(detail.ministryOrState)} />
              <Field label="Department" value={show(detail.department)} />
              <Field label="Buyer email" value={show(detail.buyerEmail)} />
              <Field label="HOD email" value={show(detail.hodEmail)} />
              <Field label="Evaluation method" value={show(detail.evaluationMethod)} />
              <Field label="Type of bid" value={show(detail.typeOfBid)} />
              <Field label="Bid to RA" value={show(detail.bidToRa)} />
              <Field label="RA qualification rule" value={show(detail.raQualificationRule)} />
              <Field
                label="Payment timeline"
                value={detail.paymentTimelineDays == null ? '—' : `${detail.paymentTimelineDays} days`}
              />
              <Field label="Bidder documents shown" value={show(detail.bidderDocumentsShown)} />
              <Field label="MSE" value={show(detail.mse)} />
              <Field label="MII" value={show(detail.mii)} />
              <Field label="L1 plus percent" value={detail.l1PlusPercent == null ? '—' : `${detail.l1PlusPercent}%`} />
              <Field label="Quantity percent" value={detail.quantityPercent == null ? '—' : `${detail.quantityPercent}%`} />
              <Field label="EMD" value={show(detail.emdRequired)} />
              <Field label="EMD amount" value={show(detail.emdAmount)} />
              <Field label="ePBG" value={show(detail.epbgRequired)} />
              <Field label="ePBG percentage" value={detail.epbgPercentage == null ? '—' : `${detail.epbgPercentage}%`} />
              <Field label="ePBG months" value={show(detail.epbgMonths)} />
              <Field label="Beneficiary" value={show(detail.beneficiaryName)} />
            </dl>
            <h3>Products</h3>
            {detail.products.length === 0 ? (
              <p className="empty">No products on this tender.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    {schedule ? <th>Schedule</th> : null}
                    <th>Name</th>
                    <th>Quantity</th>
                    <th>Delivery period</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.products.map((product, index) => (
                    <tr key={`${product.name}-${product.scheduleNumber ?? index}`}>
                      {schedule ? <td>{show(product.scheduleNumber)}</td> : null}
                      <td>{product.name}</td>
                      <td>{show(product.quantity)}</td>
                      <td>{show(product.deliveryPeriod)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h3>Documents</h3>
            {detail.documents.map((doc) => (
              <div className="doc" key={doc.name}>
                <span className="name">{doc.name}</span>
                {doc.action === 'ready' ? <span className="ready">Ready</span> : null}
                {doc.action === 'download' ? (
                  <button
                    type="button"
                    onClick={() => {
                      void window.panel?.download(detail.bidNumber, doc.name)?.then((ok) => {
                        if (ok) void reloadDetail(detail.bidNumber)
                      })
                    }}
                  >
                    Download
                  </button>
                ) : null}
                {doc.action === 'upload' ? (
                  <label className="upload">
                    Upload
                    <input
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (!file || !window.panel) return
                        void file.arrayBuffer().then((buffer) =>
                          window.panel?.upload(detail.bidNumber, doc.name, new Uint8Array(buffer), file.name)?.then((ok) => {
                            if (ok) void reloadDetail(detail.bidNumber)
                          }),
                        )
                      }}
                    />
                  </label>
                ) : null}
                {doc.template ? (
                  <button type="button" className="ghost">
                    Download template
                  </button>
                ) : null}
              </div>
            ))}
          </article>
        ) : null}
        {blocked === null && !detail ? (
          <>
            <div className="filters">
              <label>
                Ministry or state
                <input
                  value={filters.ministryOrState}
                  onChange={(event) => setFilters({ ...filters, ministryOrState: event.target.value })}
                />
              </label>
              <label>
                Evaluation method
                <input
                  value={filters.evaluationMethod}
                  onChange={(event) => setFilters({ ...filters, evaluationMethod: event.target.value })}
                />
              </label>
              <label>
                MSE
                <select
                  value={triValue(filters.mse)}
                  onChange={(event) => setFilters({ ...filters, mse: tri(event.target.value) })}
                >
                  <option value="">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label>
                EMD
                <select
                  value={triValue(filters.emd)}
                  onChange={(event) => setFilters({ ...filters, emd: tri(event.target.value) })}
                >
                  <option value="">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            {screen === 'search' ? (
              <div className="fetch">
                <label>
                  Keyword
                  <input value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                </label>
                <label>
                  Pages
                  <input
                    type="number"
                    min={1}
                    value={pages}
                    onChange={(event) => setPages(Math.max(1, Number(event.target.value) || 1))}
                  />
                </label>
                <button type="button" onClick={() => void onFetch()} disabled={fetching}>
                  Fetch
                </button>
              </div>
            ) : null}
            {fetching ? <p className="note">Fetching</p> : null}
            {rows.length === 0 ? <p className="empty">No tenders yet.</p> : null}
            <div className="list">
              {rows.map((row) => (
                <button key={row.bidNumber} type="button" className="row" onClick={() => void openBid(row.bidNumber)}>
                  <strong>{row.bidNumber}</strong>
                  <span>{row.ministryOrState || '—'}</span>
                  <span>{row.bidEnd || '—'}</span>
                  <span>{row.evaluationMethod || '—'}</span>
                  {screen === 'filled' && row.uploadedFiles.length > 0 ? (
                    <span className="files">{row.uploadedFiles.join(', ')}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
