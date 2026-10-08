import { useCallback, useEffect, useRef, useState } from 'react'
import type { TemplateField, TextTemplate } from './panel'
import { PdfMerge } from './components/PdfMerge'
import { TemplatePreview } from './components/TemplatePreview'

export function TemplateDialog({
  bidNumber,
  documentName,
  onClose,
}: {
  bidNumber: string
  documentName: string
  onClose: () => void
}) {
  const [templates, setTemplates] = useState<TextTemplate[] | null>(null)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [fields, setFields] = useState<TemplateField[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [tab, setTab] = useState<'templates' | 'pdfs'>('templates')
  const [merging, setMerging] = useState(false)
  const mergeBusy = useRef(false)
  const setMergeBusy = useCallback((busy: boolean) => {
    mergeBusy.current = busy
    setMerging(busy)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && preview == null && !mergeBusy.current) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, preview])

  useEffect(() => {
    let cancel = false
    void window.panel?.templates().then((list) => {
      if (cancel) return
      setTemplates(list)
      if (!list || list.length === 0) return
      const match = list.find((item) => item.name.trim().toLowerCase() === documentName.trim().toLowerCase())
      setTemplateId((match ?? list[0]).id)
    })
    return () => {
      cancel = true
    }
  }, [documentName])

  useEffect(() => {
    if (templateId == null) return
    let cancel = false
    setReady(false)
    setFields([])
    setNotice(null)
    void window.panel?.previewTemplate(templateId, bidNumber).then((preview) => {
      if (cancel) return
      if (!preview) {
        setNotice('Could not fill that template.')
        return
      }
      setFields(preview.fields)
      setReady(true)
    })
    return () => {
      cancel = true
    }
  }, [templateId, bidNumber])

  function fieldValues(): Record<string, string> {
    return Object.fromEntries(fields.map((field) => [field.key, field.value]))
  }

  async function onPreview() {
    const panel = window.panel
    if (!panel || busy || templateId == null || !ready) return
    setBusy(true)
    setNotice(null)
    try {
      const html = await panel.renderTemplate(templateId, fieldValues())
      if (html) setPreview(html)
      else setNotice('Could not preview that template.')
    } catch {
      setNotice('Could not preview that template.')
    } finally {
      setBusy(false)
    }
  }

  async function onSave() {
    const panel = window.panel
    if (!panel || busy || templateId == null || !ready) return
    setBusy(true)
    setNotice(null)
    try {
      const ok = await panel.saveTemplateDocument(templateId, bidNumber, documentName, fieldValues())
      if (ok) onClose()
      else setNotice('Could not save that document.')
    } catch {
      setNotice('Could not save that document.')
    } finally {
      setBusy(false)
    }
  }

  async function onDownload() {
    const panel = window.panel
    if (!panel || busy || templateId == null || !ready) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await panel.downloadTemplate(templateId, bidNumber, fieldValues())
      if (result === 'saved') onClose()
      else if (result === 'failed') setNotice('Could not download that file.')
    } catch {
      setNotice('Could not download that file.')
    } finally {
      setBusy(false)
    }
  }

  const empty = templates != null && templates.length === 0

  return (
    <>
    <div
      className="modal-back"
      onMouseDown={() => {
        if (!mergeBusy.current) onClose()
      }}
    >
      <div
        className={tab === 'pdfs' || fields.some((field) => field.key === 'productRows') ? 'modal wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="template-title">Prepare {documentName}</h2>
        <div className="pills prepare-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'templates'}
            className={tab === 'templates' ? 'pill active' : 'pill'}
            disabled={merging}
            onClick={() => setTab('templates')}
          >
            Templates
          </button>
          <button
            type="button"
            role="tab"
            id="prepare-pdfs-tab"
            aria-controls="prepare-pdfs"
            aria-selected={tab === 'pdfs'}
            className={tab === 'pdfs' ? 'pill active' : 'pill'}
            disabled={merging}
            onClick={() => setTab('pdfs')}
          >
            PDFs
          </button>
        </div>
        {tab === 'templates' && templates == null ? <p className="empty">Templates could not be loaded.</p> : null}
        {tab === 'templates' && empty ? <p className="empty">No templates yet.</p> : null}
        {tab === 'templates' && templates && templates.length > 0 ? (
          <form
            className="settings-form modal-form"
            onSubmit={(event) => {
              event.preventDefault()
              void onSave()
            }}
          >
            <label className="wide">
              Template
              <select
                value={templateId ?? ''}
                onChange={(event) => setTemplateId(Number(event.target.value))}
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {ready && fields.length === 0 ? <p className="empty">No fields to check.</p> : null}
            {fields.map((field) =>
              field.key === 'productRows' ? (
                <ProductRowsEditor
                  key={field.key}
                  value={field.value}
                  onChange={(value) => updateField(setFields, field.key, value)}
                />
              ) : (
                <label key={field.key} className="wide">
                  {field.label}
                  {field.key === 'address' || field.key === 'products' ? (
                    <textarea
                      rows={3}
                      value={field.value}
                      onChange={(event) => updateField(setFields, field.key, event.target.value)}
                    />
                  ) : (
                    <input
                      value={field.value}
                      onChange={(event) => updateField(setFields, field.key, event.target.value)}
                    />
                  )}
                </label>
              ),
            )}
            <div className="settings-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn btn-secondary" disabled={busy || !ready} onClick={() => void onPreview()}>
                Preview
              </button>
              <button type="button" className="btn btn-secondary" disabled={busy || !ready} onClick={() => void onDownload()}>
                Download
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !ready}>
                Save to document
              </button>
            </div>
          </form>
        ) : tab === 'templates' ? (
          <div className="settings-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}
        <div id="prepare-pdfs" role="tabpanel" aria-labelledby="prepare-pdfs-tab" hidden={tab !== 'pdfs'}>
          <PdfMerge bidNumber={bidNumber} documentName={documentName} onClose={onClose} onBusy={setMergeBusy} />
        </div>
        {tab === 'templates' && notice ? (
          <p className="form-note" role="status">
            {notice}
          </p>
        ) : null}
      </div>
    </div>
    {preview != null ? <TemplatePreview html={preview} onClose={() => setPreview(null)} /> : null}
    </>
  )
}

type ProductColumn = { key: string; label: string }
type ProductRows = { columns: ProductColumn[]; rows: Record<string, string>[] }

function parseProductRows(raw: string): ProductRows | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if (!Array.isArray(record.columns) || !Array.isArray(record.rows)) return null
  const columns: ProductColumn[] = []
  for (const column of record.columns) {
    if (!column || typeof column !== 'object' || Array.isArray(column)) return null
    const item = column as Record<string, unknown>
    if (typeof item.key !== 'string' || typeof item.label !== 'string') return null
    columns.push({ key: item.key, label: item.label })
  }
  const rows: Record<string, string>[] = []
  for (const row of record.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null
    const cells: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      if (typeof value !== 'string') return null
      cells[key] = value
    }
    rows.push(cells)
  }
  return { columns, rows }
}

function ProductRowsEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parsed = parseProductRows(value)
  if (!parsed) {
    return (
      <label className="wide">
        Products
        <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    )
  }

  function commit(next: ProductRows) {
    onChange(JSON.stringify(next))
  }

  return (
    <div className="product-grid">
      <span className="product-grid-label">Products</span>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="product-row-action" />
              {parsed.columns.map((column) => (
                <th key={column.key} className={shortColumn(column.key) ? 'product-col-short' : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, index) => (
              <tr key={index}>
                <td className="product-row-action">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-remove"
                    aria-label="Remove"
                    onClick={() =>
                      commit({
                        columns: parsed.columns,
                        rows: parsed.rows.filter((_, rowIndex) => rowIndex !== index),
                      })
                    }
                  >
                    <DeleteIcon />
                  </button>
                </td>
                {parsed.columns.map((column) => (
                  <td key={column.key} className={shortColumn(column.key) ? 'product-col-short' : undefined}>
                    <input
                      aria-label={column.label}
                      value={row[column.key] ?? ''}
                      onChange={(event) => {
                        const rows = parsed.rows.map((item, rowIndex) =>
                          rowIndex === index ? { ...item, [column.key]: event.target.value } : item,
                        )
                        commit({ columns: parsed.columns, rows })
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            const blank: Record<string, string> = {}
            for (const column of parsed.columns) blank[column.key] = ''
            commit({ columns: parsed.columns, rows: [...parsed.rows, blank] })
          }}
        >
          Add product
        </button>
      </div>
    </div>
  )
}

function shortColumn(key: string) {
  return key === 'quantity' || key === 'offerPrice' || key === 'mrp'
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 4.5h9M6.25 4.5V3.25h3.5V4.5M4.75 4.5l.5 8.25h5.5l.5-8.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function updateField(
  setFields: (value: TemplateField[] | ((current: TemplateField[]) => TemplateField[])) => void,
  key: string,
  value: string,
) {
  setFields((current) => current.map((field) => (field.key === key ? { ...field, value } : field)))
}
