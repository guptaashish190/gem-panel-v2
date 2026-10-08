import type { Summary } from '../panel'
import { buyer, emdLabel, evaluationValue, mseValue } from '../format'
import { StatusMark } from './StatusMark'
import type { RowMenuState } from './RowMenu'
import { statusTone } from '../status'

export type FetchStatus = 'Downloading' | 'Analyzing' | 'Downloaded' | 'Failed'

export type Shown = Summary & { fetchStatus: FetchStatus; pending: boolean }

export function TenderTable({
  heading,
  poolCount,
  rows,
  showFiles,
  next,
  onOpen,
  onMenu,
}: {
  heading: string
  poolCount: number
  rows: Shown[]
  showFiles: boolean
  next: { fetching: boolean; hasMore: boolean; onFetch: () => void } | null
  onOpen: (bidNumber: string) => void
  onMenu: (menu: RowMenuState) => void
}) {
  return (
    <section className="block">
      <h2>{heading}</h2>
      {poolCount === 0 ? <p className="empty">No tenders yet.</p> : null}
      {poolCount > 0 && rows.length === 0 ? <p className="empty">No tenders match.</p> : null}
      {rows.length > 0 ? (
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
                {showFiles ? <th>Files</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const failed = row.fetchStatus === 'Failed'
                const waiting = failed || (row.pending && row.fetchStatus !== 'Downloaded')
                return (
                  <tr
                    key={row.bidNumber}
                    className={[waiting ? 'pending' : '', failed ? 'fail' : '', row.saved ? 'saved' : '', !waiting && row.status ? `tone-${statusTone(row.status)}` : '', !failed && !row.pending && row.pdf !== 'ready' ? 'warn' : ''].filter(Boolean).join(' ')}
                    tabIndex={waiting ? -1 : 0}
                    onClick={() => {
                      if (!waiting) onOpen(row.bidNumber)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      onMenu({
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
                      onOpen(row.bidNumber)
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
                    {showFiles ? <td className="muted">{row.uploadedFiles.join(', ') || '—'}</td> : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {next ? (
        <div className="list-more">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={next.onFetch}
            disabled={next.fetching || !next.hasMore}
          >
            Fetch next page
          </button>
        </div>
      ) : null}
    </section>
  )
}
