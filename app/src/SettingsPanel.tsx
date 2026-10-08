import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { CompanyDocument, CompanyField } from './panel'
import { TemplatesCard } from './components/TemplatesCard'

const SUGGESTIONS = ['Bidder Turnover Certificate', 'Drug License']

const RESERVED_KEYS = [
  'companyName',
  'signatory',
  'address',
  'drugLicenseNumber',
  'gstin',
  'email',
  'phone',
  'udyamNumber',
  'bidNumber',
  'bidEnd',
  'offerValidity',
  'ministryOrState',
  'department',
  'beneficiaryName',
  'buyerEmail',
  'hodEmail',
  'evaluationMethod',
  'emdAmount',
  'products',
  'productRows',
  'product',
]

function fieldKey(label: string): string {
  const words = label.match(/[A-Za-z0-9]+/g) ?? []
  const key = words
    .map((word, index) => {
      const lower = word.toLowerCase()
      return index === 0 ? lower : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
    })
    .join('')
  if (!key) return ''
  return /^[0-9]/.test(key) ? `field${key}` : key
}

export function SettingsPanel() {
  const [loaded, setLoaded] = useState(false)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [signatory, setSignatory] = useState('')
  const [address, setAddress] = useState('')
  const [drugLicenseNumber, setDrugLicenseNumber] = useState('')
  const [gstin, setGstin] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [udyamNumber, setUdyamNumber] = useState('')
  const [customFields, setCustomFields] = useState<CompanyField[]>([])
  const [fieldDraft, setFieldDraft] = useState('')
  const [savedCount, setSavedCount] = useState(0)
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
      setGstin(next.gstin)
      setEmail(next.email)
      setPhone(next.phone)
      setUdyamNumber(next.udyamNumber)
      setCustomFields(next.fields)
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
      const ok = await panel.saveCompany({
        name,
        signatory,
        address,
        drugLicenseNumber,
        gstin,
        email,
        phone,
        udyamNumber,
        fields: customFields,
      })
      if (ok) {
        await load(true)
        setSavedCount((count) => count + 1)
      }
      setNotice(ok ? 'Saved.' : 'Could not save.')
    } catch {
      setNotice('Could not save.')
    } finally {
      setBusy(false)
    }
  }

  function onAddField() {
    const label = fieldDraft.trim()
    if (busy || !label) return
    const key = fieldKey(label)
    if (!key) {
      setNotice('Use letters or digits in the field name.')
      return
    }
    const lower = key.toLowerCase()
    const taken = [...RESERVED_KEYS, ...customFields.map((field) => field.key)]
    if (taken.some((item) => item.toLowerCase() === lower)) {
      setNotice('That field is already listed.')
      return
    }
    setNotice(null)
    setCustomFields((current) => [...current, { key, label, value: '' }])
    setFieldDraft('')
  }

  function setFieldValue(key: string, value: string) {
    setCustomFields((current) => current.map((field) => (field.key === key ? { ...field, value } : field)))
  }

  function removeField(key: string) {
    setCustomFields((current) => current.filter((field) => field.key !== key))
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
            <label>
              GSTIN
              <input value={gstin} onChange={(event) => setGstin(event.target.value)} />
            </label>
            <label>
              Udyam certificate number
              <input value={udyamNumber} onChange={(event) => setUdyamNumber(event.target.value)} />
            </label>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Phone number
              <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            {customFields.map((field) => (
              <label key={field.key} className="wide">
                {field.label}
                <span className="custom-field-row">
                  <input value={field.value} onChange={(event) => setFieldValue(field.key, event.target.value)} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-remove"
                    aria-label={`Remove ${field.label}`}
                    disabled={busy}
                    onClick={() => removeField(field.key)}
                  >
                    Remove
                  </button>
                </span>
              </label>
            ))}
            <div className="doc-add custom-field-add">
              <input
                className="grow"
                value={fieldDraft}
                placeholder="Field name, e.g. GSTIN"
                aria-label="Field name"
                onChange={(event) => setFieldDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  onAddField()
                }}
              />
              <button type="button" className="btn btn-secondary" disabled={busy || !fieldDraft.trim()} onClick={onAddField}>
                Add field
              </button>
            </div>
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
                    <tr key={doc.name} className={doc.action === 'download' ? 'warn' : doc.action === 'ready' ? 'ready' : ''}>
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

      <TemplatesCard refreshKey={savedCount} />
      {notice ? (
        <p className="form-note" role="status">
          {notice}
        </p>
      ) : null}
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
        <>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void window.panel?.openCompanyDocument(doc.name)}>
            Open
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void window.panel?.exportCompanyDocument(doc.name)}>
            Download
          </button>
        </>
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
