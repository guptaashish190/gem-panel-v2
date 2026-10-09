import { useCallback, useEffect, useRef, useState } from 'react'
import type { TenderDetail } from './panel'
import { DocumentsSection } from './components/DocumentsSection'
import { Stat } from './components/Stat'
import { money } from './format'
import { TemplateDialog } from './TemplateDialog'
import { statusTone, TENDER_STATUSES } from './status'

function show(value: string | number | boolean | null): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function emdStat(detail: TenderDetail): { value: string; warn: boolean } {
  if (detail.emdRequired === false) return { value: 'Not required', warn: false }
  if (detail.emdAmount != null) return { value: money(detail.emdAmount), warn: true }
  if (detail.emdRequired === true) return { value: 'Required', warn: true }
  return { value: '—', warn: false }
}

function gemPdf(detail: TenderDetail): TenderDetail['documents'][number] | undefined {
  return detail.documents.find((doc) => doc.name.trim().toLowerCase() === 'gem pdf')
}

function tenderDocuments(detail: TenderDetail): TenderDetail['documents'] {
  const hidden = new Set(['gem pdf', 'contract', 'crac'])
  const required = new Set(detail.requiredDocumentNames.map((name) => name.trim().toLowerCase()).filter(Boolean))
  return detail.documents.filter((doc) => {
    const name = doc.name.trim().toLowerCase()
    return required.has(name) && !hidden.has(name)
  })
}

function epbg(detail: TenderDetail): string {
  if (detail.epbgRequired === false) return 'Not required'
  const percent = detail.epbgPercentage == null ? '' : `${detail.epbgPercentage}%`
  const months = detail.epbgMonths == null ? '' : `${detail.epbgMonths} months`
  const line = [percent, months].filter(Boolean).join(' for ')
  if (line) return line
  return show(detail.epbgRequired)
}

export function TenderWindow({ bidNumber }: { bidNumber: string }) {
  const [detail, setDetail] = useState<TenderDetail | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [templateFor, setTemplateFor] = useState<string | null>(null)
  const [reanalyze, setReanalyze] = useState<'idle' | 'running' | 'failed'>('idle')
  const [signedOut, setSignedOut] = useState(false)
  const request = useRef(0)

  const reload = useCallback(async () => {
    const panel = window.panel
    if (!panel) return
    const id = ++request.current
    const next = await panel.open(bidNumber)
    if (id !== request.current) return
    setDetail(next)
    setMissing(next == null)
  }, [bidNumber])

  useEffect(() => {
    document.title = bidNumber
    const panel = window.panel
    if (!panel) {
      setBlocked('the panel cannot reach its records')
      return
    }
    let cancel = false
    void panel.reachable().then((result) => {
      if (!cancel) setBlocked(result.ok ? null : result.message)
    })
    void reload()
    const stopRow = panel.onRow(() => {
      void reload()
    })
    const stopSession = panel.onSession(() => {
      void panel.session().then((next) => {
        setSignedOut(next == null)
        if (next) void reload()
      })
    })
    void panel.session().then((next) => {
      if (!cancel) setSignedOut(next == null)
    })
    return () => {
      cancel = true
      stopRow()
      stopSession()
    }
  }, [bidNumber, reload])

  const schedule = detail?.products.some((product) => product.scheduleNumber != null) ?? false
  const taggedCount = detail?.products.filter((product) => product.tagged).length ?? 0
  const documents = detail ? tenderDocuments(detail) : []
  const pdf = detail ? gemPdf(detail) : undefined
  const emd = detail ? emdStat(detail) : null

  return (
    <div className="app">
      {blocked ? <p className="banner">{blocked}</p> : null}
      {signedOut ? <p className="banner">Sign in from the main window.</p> : null}
      {reanalyze === 'failed' ? (
        <p className="banner">Could not reanalyze: the GeM PDF for this tender is not available or could not be read.</p>
      ) : null}
      <article className="screen">
        <div className="detail-bar">
          <button type="button" className="btn btn-ghost" onClick={() => window.close()}>
            Back
          </button>
          <span className="spacer" />
          {pdf && pdf.action !== 'upload' ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const panel = window.panel
                if (!panel || !detail) return
                if (pdf.action === 'ready') {
                  void panel.openLocal(detail.bidNumber, pdf.name)
                  return
                }
                void panel.download(detail.bidNumber, pdf.name).then((ok) => {
                  if (!ok) return
                  void panel.openLocal(detail.bidNumber, pdf.name)
                  void reload()
                })
              }}
            >
              Open PDF
            </button>
          ) : null}
          {detail ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={reanalyze === 'running'}
              onClick={() => {
                const panel = window.panel
                if (!panel) return
                setReanalyze('running')
                void panel.reanalyze(detail.bidNumber).then((ok) => {
                  setReanalyze(ok ? 'idle' : 'failed')
                  if (ok) void reload()
                })
              }}
            >
              {reanalyze === 'running' ? 'Reanalyzing…' : 'Reanalyze'}
            </button>
          ) : null}
          {detail ? (
            <button
              type="button"
              className={detail.saved ? 'btn btn-secondary' : 'btn btn-primary'}
              onClick={() => {
                const panel = window.panel
                if (!panel) return
                void (detail.saved ? panel.unsave(detail.bidNumber) : panel.save(detail.bidNumber)).then(() => {
                  void reload()
                })
              }}
            >
              {detail.saved ? 'Unsave' : 'Save'}
            </button>
          ) : null}
        </div>

        <header className="title-block">
          <h1>{bidNumber}</h1>
          <p className="sub">{detail?.department || (missing || blocked ? '—' : 'Loading')}</p>
          {detail ? (
            <div className="pills">
              <span className="pill active">{show(detail.evaluationMethod)}</span>
              <span className={detail.saved ? 'pill active' : 'pill'}>{detail.saved ? 'Saved' : 'Not saved'}</span>
              {detail.status ? (
                <span className={`status-pill ${statusTone(detail.status)}`}>{detail.status}</span>
              ) : null}
            </div>
          ) : null}
        </header>

        {detail ? (
          <div className="status-choices" role="group" aria-label="Status">
            {TENDER_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={detail.status === status ? `status-choice on ${statusTone(status)}` : 'status-choice'}
                onClick={() => {
                  const next = detail.status === status ? null : status
                  void window.panel?.setStatus(detail.bidNumber, next)?.then((ok) => {
                    if (ok) void reload()
                  })
                }}
              >
                {status}
              </button>
            ))}
          </div>
        ) : null}

        {missing && !blocked ? <p className="empty">This tender is not available.</p> : null}

        {detail && emd ? (
          <>
            <div className="stats stats-4">
              <Stat value={show(detail.bidEnd)} label="Closes" />
              <Stat value={show(detail.evaluationMethod)} label="Evaluation" />
              <Stat value={show(detail.mse)} label="MSE" />
              <Stat value={emd.value} label="EMD" warn={emd.warn} />
            </div>

            <section className="card">
              <h2 className="card-title">Bid</h2>
              <div className="facts">
                <Field label="Closes" value={show(detail.bidEnd)} />
                <Field label="Offer validity" value={show(detail.offerValidity)} />
                <Field label="Ministry / state" value={show(detail.ministryOrState)} />
                <Field label="Department" value={show(detail.department)} />
                <Field label="Buyer email" value={show(detail.buyerEmail)} />
                <Field label="HOD email" value={show(detail.hodEmail)} />
                <Field label="Evaluation" value={show(detail.evaluationMethod)} />
                <Field label="Type of bid" value={show(detail.typeOfBid)} />
                <Field label="Bid to RA" value={show(detail.bidToRa)} />
                {detail.raQualificationRule ? <Field label="RA qualification" value={detail.raQualificationRule} /> : null}
                <Field
                  label="Payment"
                  value={detail.paymentTimelineDays == null ? '—' : `${detail.paymentTimelineDays} days`}
                />
                <Field label="Bidder documents shown" value={show(detail.bidderDocumentsShown)} />
                <Field label="MSE" value={show(detail.mse)} />
                <Field label="MII" value={show(detail.mii)} />
                <Field label="L1 plus percent" value={detail.l1PlusPercent == null ? '—' : `${detail.l1PlusPercent}%`} />
                <Field
                  label="Quantity percent"
                  value={detail.quantityPercent == null ? '—' : `${detail.quantityPercent}%`}
                />
                <Field label="EMD" value={detail.emdRequired === false ? 'Not required' : show(detail.emdRequired)} />
                <Field label="EMD amount" value={detail.emdAmount == null ? '—' : money(detail.emdAmount)} />
                <Field label="ePBG" value={epbg(detail)} />
                <Field label="Beneficiary" value={show(detail.beneficiaryName)} />
              </div>
            </section>

            <section className="block">
              <h2>
                Products · {detail.products.length}
                {taggedCount > 0 ? ` · ${taggedCount} tagged` : ''}
              </h2>
              {detail.products.length === 0 ? (
                <p className="empty">No products on this tender.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="product-tag-col" />
                        {schedule ? <th className="num">Schedule</th> : null}
                        <th>Name</th>
                        <th className="num">Qty</th>
                        <th>Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.products.map((product, index) => (
                        <tr
                          key={`${product.id}-${product.name}-${product.scheduleNumber ?? index}`}
                          className={product.tagged ? 'product-tagged' : undefined}
                        >
                          <td className="product-tag-col">
                            <button
                              type="button"
                              className={
                                product.tagged ? 'btn btn-ghost btn-icon product-tag active' : 'btn btn-ghost btn-icon product-tag'
                              }
                              aria-label={product.tagged ? 'Untag product' : 'Tag product'}
                              aria-pressed={product.tagged}
                              onClick={() => {
                                const panel = window.panel
                                if (!panel) return
                                void panel.setProductTag(product.id, !product.tagged).then((ok) => {
                                  if (ok) void reload()
                                })
                              }}
                            >
                              <TagIcon filled={product.tagged} />
                            </button>
                          </td>
                          {schedule ? <td className="num">{show(product.scheduleNumber)}</td> : null}
                          <td>{product.name}</td>
                          <td className="num">{show(product.quantity)}</td>
                          <td>{show(product.deliveryPeriod)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <DocumentsSection
              bidNumber={detail.bidNumber}
              documents={documents}
              onReload={() => void reload()}
              onPrepare={setTemplateFor}
            />
            {templateFor ? (
              <TemplateDialog bidNumber={detail.bidNumber} documentName={templateFor} onClose={() => setTemplateFor(null)} />
            ) : null}
          </>
        ) : null}
      </article>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="fact-label">{label}</div>
      <div className="fact-value">{value}</div>
    </div>
  )
}

function TagIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 2.5h5.2L13.5 8.3a1.2 1.2 0 0 1 0 1.7l-3.5 3.5a1.2 1.2 0 0 1-1.7 0L2.5 7.7V2.5Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="5.25" cy="5.25" r="1" fill={filled ? '#fff' : 'currentColor'} />
    </svg>
  )
}
