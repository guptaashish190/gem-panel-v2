import { useEffect, useState } from 'react'
import type { CompanyDocument, MergeSource } from '../panel'

type MergeRow =
  | { id: string; kind: 'company'; name: string }
  | { id: string; kind: 'upload'; name: string; data: Uint8Array }

export function PdfMerge({
  bidNumber,
  documentName,
  onClose,
  onBusy,
}: {
  bidNumber: string
  documentName: string
  onClose: () => void
  onBusy: (busy: boolean) => void
}) {
  const [companyDocs, setCompanyDocs] = useState<CompanyDocument[] | null | 'missing'>(null)
  const [rows, setRows] = useState<MergeRow[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const panel = window.panel
    if (!panel) {
      setCompanyDocs('missing')
      return
    }
    let cancel = false
    void panel.company().then(
      (profile) => {
        if (!cancel) setCompanyDocs(profile ? profile.documents : 'missing')
      },
      () => {
        if (!cancel) setCompanyDocs('missing')
      },
    )
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    onBusy(busy)
  }, [busy, onBusy])

  const hasCompany = rows.some((row) => row.kind === 'company')
  const hasUpload = rows.some((row) => row.kind === 'upload')

  async function onPick(files: File[]) {
    if (files.length === 0 || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const rejected: string[] = []
      const added: MergeRow[] = []
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          rejected.push(file.name)
          continue
        }
        added.push({
          id: crypto.randomUUID(),
          kind: 'upload',
          name: file.name,
          data: new Uint8Array(await file.arrayBuffer()),
        })
      }
      if (added.length > 0) setRows((current) => [...current, ...added])
      if (rejected.length === 1) setNotice(`${rejected[0]} is not a PDF.`)
      else if (rejected.length > 1) setNotice(`${rejected.join(', ')} are not PDFs.`)
    } catch {
      setNotice('Could not read those PDFs.')
    } finally {
      setBusy(false)
    }
  }

  function addCompany(name: string) {
    setRows((current) => {
      if (current.some((row) => row.kind === 'company' && row.name === name)) return current
      return [...current, { id: crypto.randomUUID(), kind: 'company', name }]
    })
    setNotice(null)
  }

  async function onMerge() {
    const panel = window.panel
    if (!panel || busy || rows.length === 0) return
    setBusy(true)
    setNotice(null)
    const sources: MergeSource[] = rows.map((row) =>
      row.kind === 'company' ? { kind: 'company', name: row.name } : { kind: 'upload', name: row.name, data: row.data },
    )
    try {
      const result = await panel.mergeDocument(bidNumber, documentName, sources)
      if (result?.ok) onClose()
      else setNotice(result && !result.ok ? result.message : 'Could not merge those PDFs.')
    } catch {
      setNotice('Could not merge those PDFs.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="merge-panel">
      <h3>Company documents</h3>
      {companyDocs == null ? <p className="empty">Loading company documents.</p> : null}
      {companyDocs === 'missing' ? <p className="empty">Company documents could not be loaded.</p> : null}
      {companyDocs?.length === 0 ? <p className="empty">No company documents yet.</p> : null}
      {Array.isArray(companyDocs) && companyDocs.length > 0 ? (
        <div>
          {companyDocs.map((doc) => {
            const added = rows.some((row) => row.kind === 'company' && row.name === doc.name)
            const missing = doc.action === 'upload'
            return (
              <div key={doc.name} className="merge-row">
                <span className="name">{doc.name}</span>
                {missing ? <span className="merge-muted">No file yet</span> : null}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || missing || added}
                  onClick={() => addCompany(doc.name)}
                >
                  {added ? 'Added' : 'Add'}
                </button>
              </div>
            )
          })}
        </div>
      ) : null}

      <h3>Upload</h3>
      <label className={busy ? 'btn btn-secondary is-disabled' : 'btn btn-secondary'}>
        Add PDFs
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            void onPick(files)
          }}
        />
      </label>

      <h3>Merge order</h3>
      {rows.length === 0 ? (
        <p className="empty">Add company documents or upload PDFs. The order here is the page order.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>From</th>
                <th className="end" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.kind === 'company' ? 'Company' : 'Upload'}</td>
                  <td className="end">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Move ${row.name} up`}
                      disabled={busy || index === 0}
                      onClick={() => setRows((current) => moveRow(current, row.id, -1))}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Move ${row.name} down`}
                      disabled={busy || index === rows.length - 1}
                      onClick={() => setRows((current) => moveRow(current, row.id, 1))}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-remove"
                      aria-label={`Remove ${row.name}`}
                      disabled={busy}
                      onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasCompany && hasUpload ? <p className="form-note">Company documents and uploads are merged in this order.</p> : null}
      {notice ? (
        <p className="form-note" role="status">
          {notice}
        </p>
      ) : null}
      <div className="settings-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || rows.length === 0} onClick={() => void onMerge()}>
          Merge and save
        </button>
      </div>
    </div>
  )
}

function moveRow(rows: MergeRow[], id: string, delta: number): MergeRow[] {
  const index = rows.findIndex((row) => row.id === id)
  const next = index + delta
  if (index < 0 || next < 0 || next >= rows.length) return rows
  const copy = rows.slice()
  const [row] = copy.splice(index, 1)
  copy.splice(next, 0, row)
  return copy
}
