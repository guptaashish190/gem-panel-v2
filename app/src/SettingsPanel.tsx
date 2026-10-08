import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { CompanyDocument, TemplatePlaceholder, TextTemplate } from './panel'

const SUGGESTIONS = ['Bidder Turnover Certificate', 'Drug License']

export function SettingsPanel() {
  const [loaded, setLoaded] = useState(false)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [signatory, setSignatory] = useState('')
  const [address, setAddress] = useState('')
  const [drugLicenseNumber, setDrugLicenseNumber] = useState('')
  const [documents, setDocuments] = useState<CompanyDocument[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (applyFields: boolean) => {
    const next = await window.panel?.company()
    if (!next) {
      setMissing(true)
      setLoaded(true)
      return null
    }
    setMissing(false)
    if (applyFields) {
      setName(next.name)
      setSignatory(next.signatory)
      setAddress(next.address)
      setDrugLicenseNumber(next.drugLicenseNumber)
    }
    setDocuments(next.documents)
    setLoaded(true)
    return next
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])

  async function refreshDocuments() {
    await load(false)
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    const panel = window.panel
    if (!panel || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const ok = await panel.saveCompany({ name, signatory, address, drugLicenseNumber })
      if (ok) await load(true)
      setNotice(ok ? 'Saved.' : 'Could not save.')
    } catch {
      setNotice('Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function onAdd(value: string) {
    const panel = window.panel
    const trimmed = value.trim()
    if (!panel || busy || !trimmed) return
    if (documents.some((doc) => doc.name.toLowerCase() === trimmed.toLowerCase())) {
      setNotice('That document is already listed.')
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const ok = await panel.addCompanyDocument(trimmed)
      if (ok) {
        setDraft('')
        await refreshDocuments()
      } else {
        setNotice('Could not add that document.')
      }
    } catch {
      setNotice('Could not add that document.')
    } finally {
      setBusy(false)
    }
  }

  async function onUpload(doc: CompanyDocument, file: File) {
    const panel = window.panel
    if (!panel || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const buffer = await file.arrayBuffer()
      const ok = await panel.uploadCompanyDocument(doc.name, new Uint8Array(buffer), file.name)
      if (ok) await refreshDocuments()
      else setNotice('Could not upload that file.')
    } catch {
      setNotice('Could not upload that file.')
    } finally {
      setBusy(false)
    }
  }

  async function onDownload(doc: CompanyDocument) {
    const panel = window.panel
    if (!panel || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const ok = await panel.downloadCompanyDocument(doc.name)
      if (ok) await refreshDocuments()
      else setNotice('Could not download that file.')
    } catch {
      setNotice('Could not download that file.')
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(doc: CompanyDocument) {
    const panel = window.panel
    if (!panel || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const ok = await panel.removeCompanyDocument(doc.name)
      if (ok) await refreshDocuments()
      else setNotice('Could not remove that document.')
    } catch {
      setNotice('Could not remove that document.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null
  if (missing) return <p className="empty">Company details could not be loaded.</p>

  const suggestions = SUGGESTIONS.filter(
    (item) => !documents.some((doc) => doc.name.toLowerCase() === item.toLowerCase()),
  )

  return (
    <div className="settings">
      <section className="block">
        <h2>Company</h2>
        <div className="card">
          <form className="settings-form" onSubmit={(event) => void onSave(event)}>
            <label>
              Company name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Authorized signatory name
              <input value={signatory} onChange={(event) => setSignatory(event.target.value)} />
            </label>
            <label className="wide">
              Address
              <textarea value={address} rows={4} onChange={(event) => setAddress(event.target.value)} />
            </label>
            <label className="wide">
              Drug license number
              <input value={drugLicenseNumber} onChange={(event) => setDrugLicenseNumber(event.target.value)} />
            </label>
            <div className="settings-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="block">
        <h2>Documents</h2>
        <div className="card">
          <form
            className="doc-add"
            onSubmit={(event) => {
              event.preventDefault()
              void onAdd(draft)
            }}
          >
            <input
              className="grow"
              value={draft}
              placeholder="Document name"
              aria-label="Document name"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
              Add
            </button>
          </form>
          {suggestions.length > 0 ? (
            <div className="suggest-row">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="pill"
                  disabled={busy}
                  onClick={() => void onAdd(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          {documents.length === 0 ? <p className="empty doc-empty">No documents yet.</p> : null}
          {documents.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>File</th>
                    <th className="end" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.name} className={doc.action === 'download' ? 'warn' : ''}>
                      <td>{doc.name}</td>
                      <td>
                        <div className="file-actions">
                          <FileActions doc={doc} busy={busy} onUpload={onUpload} onDownload={onDownload} />
                        </div>
                      </td>
                      <td className="end">
                        <button type="button" className="btn btn-ghost btn-remove" disabled={busy} onClick={() => void onRemove(doc)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      <TemplatesCard />
      {notice ? (
        <p className="form-note" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  )
}

function TemplatesCard() {
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [templates, setTemplates] = useState<TextTemplate[] | null>(null)
  const [placeholders, setPlaceholders] = useState<TemplatePlaceholder[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const load = useCallback(async () => {
    const panel = window.panel
    if (!panel) return
    const [list, chips] = await Promise.all([panel.templates(), panel.templatePlaceholders()])
    setTemplates(list)
    setPlaceholders(chips)
    setMissing(list == null)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function choose(template: TextTemplate | null) {
    setSelectedId(template?.id ?? null)
    setName(template?.name ?? '')
    setBody(template?.body ?? '')
    setNotice(null)
  }

  function insertToken(key: string) {
    const token = `{{${key}}}`
    const el = bodyRef.current
    if (!el) {
      setBody((current) => `${current}${token}`)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`)
    const caret = start + token.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    const panel = window.panel
    const trimmed = name.trim()
    if (!panel || busy || !trimmed) return
    if (templates?.some((item) => item.id !== selectedId && item.name.toLowerCase() === trimmed.toLowerCase())) {
      setNotice('That template is already listed.')
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const ok = await panel.saveTemplate({ id: selectedId, name, body })
      if (!ok) {
        setNotice('Could not save.')
        return
      }
      const list = await panel.templates()
      setTemplates(list)
      setMissing(list == null)
      const saved = list?.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())
      if (saved) {
        setSelectedId(saved.id)
        setName(saved.name)
        setBody(saved.body)
      }
      setNotice('Saved.')
    } catch {
      setNotice('Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function onPreview() {
    const panel = window.panel
    if (!panel || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const html = await panel.previewTemplateText(body)
      if (html) setPreview(html)
      else setNotice('Could not preview that template.')
    } catch {
      setNotice('Could not preview that template.')
    } finally {
      setBusy(false)
    }
  }

  async function onRemove() {
    const panel = window.panel
    if (!panel || busy || selectedId == null) return
    setBusy(true)
    setNotice(null)
    try {
      const ok = await panel.removeTemplate(selectedId)
      if (!ok) {
        setNotice('Could not remove that template.')
        return
      }
      choose(null)
      await load()
    } catch {
      setNotice('Could not remove that template.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="block">
      <h2>Templates</h2>
      <div className="card">
        {missing ? <p className="empty doc-empty">Templates could not be loaded.</p> : null}
        {!missing && templates?.length === 0 ? <p className="empty doc-empty">No templates yet.</p> : null}
        <div className="suggest-row">
          <button type="button" className={selectedId == null ? 'pill active' : 'pill'} disabled={busy} onClick={() => choose(null)}>
            New
          </button>
          {templates?.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === selectedId ? 'pill active' : 'pill'}
              disabled={busy}
              onClick={() => choose(item)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <form className="settings-form" onSubmit={(event) => void onSave(event)}>
          <label className="wide">
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="token-row">
            {placeholders.map((item) => (
              <button key={item.key} type="button" className="pill" disabled={busy} onClick={() => insertToken(item.key)}>
                {`{{${item.key}}}`}
              </button>
            ))}
          </div>
          <label className="wide">
            Text
            <textarea ref={bodyRef} value={body} rows={8} onChange={(event) => setBody(event.target.value)} />
          </label>
          <p className="empty template-note">Markdown. **bold** and tables. HTML can center or underline a line.</p>
          <div className="settings-actions">
            {selectedId != null ? (
              <button type="button" className="btn btn-ghost btn-remove" disabled={busy} onClick={() => void onRemove()}>
                Remove
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onPreview()}>
              Preview
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
              Save
            </button>
          </div>
        </form>
        {notice ? (
          <p className="form-note template-note" role="status">
            {notice}
          </p>
        ) : null}
      </div>
      {preview != null ? <TemplatePreview html={preview} onClose={() => setPreview(null)} /> : null}
    </section>
  )
}

function TemplatePreview({ html, onClose }: { html: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="template-preview-title">Preview</h2>
        <iframe className="template-preview" title="Preview" sandbox="" srcDoc={html} />
        <div className="settings-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function FileActions({
  doc,
  busy,
  onUpload,
  onDownload,
}: {
  doc: CompanyDocument
  busy: boolean
  onUpload: (doc: CompanyDocument, file: File) => Promise<void>
  onDownload: (doc: CompanyDocument) => Promise<void>
}) {
  function pick(file: File | undefined) {
    if (file) void onUpload(doc, file)
  }

  return (
    <>
      {doc.action === 'ready' ? (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void window.panel?.openCompanyDocument(doc.name)}>
          Ready
        </button>
      ) : null}
      {doc.action === 'download' ? (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onDownload(doc)}>
          Download
        </button>
      ) : null}
      {doc.action === 'upload' ? (
        <FileButton label="Upload" disabled={busy} onFile={pick} />
      ) : (
        <FileButton label="Replace" disabled={busy} onFile={pick} />
      )}
    </>
  )
}

function FileButton({
  label,
  disabled,
  onFile,
}: {
  label: string
  disabled: boolean
  onFile: (file: File | undefined) => void
}) {
  return (
    <label className={disabled ? 'btn btn-ghost is-disabled' : 'btn btn-ghost'}>
      {label}
      <input
        type="file"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          onFile(file)
        }}
      />
    </label>
  )
}
