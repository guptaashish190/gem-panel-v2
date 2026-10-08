import { useEffect, useState } from 'react'
import type { TemplateField, TextTemplate } from './panel'

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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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

  async function onDownload() {
    const panel = window.panel
    if (!panel || busy || templateId == null || !ready) return
    setBusy(true)
    setNotice(null)
    try {
      const values = Object.fromEntries(fields.map((field) => [field.key, field.value]))
      const result = await panel.downloadTemplate(templateId, bidNumber, values)
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
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="template-title">Template for {documentName}</h2>
        {templates == null ? <p className="empty">Templates could not be loaded.</p> : null}
        {empty ? <p className="empty">No templates yet.</p> : null}
        {templates && templates.length > 0 ? (
          <form
            className="settings-form modal-form"
            onSubmit={(event) => {
              event.preventDefault()
              void onDownload()
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
            {fields.map((field) => (
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
            ))}
            <div className="settings-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !ready}>
                Download
              </button>
            </div>
          </form>
        ) : (
          <div className="settings-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        )}
        {notice ? (
          <p className="form-note" role="status">
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function updateField(
  setFields: (value: TemplateField[] | ((current: TemplateField[]) => TemplateField[])) => void,
  key: string,
  value: string,
) {
  setFields((current) => current.map((field) => (field.key === key ? { ...field, value } : field)))
}
