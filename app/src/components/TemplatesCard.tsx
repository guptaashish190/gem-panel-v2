import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { TemplatePlaceholder, TextTemplate } from '../panel'
import { TemplatePreview } from './TemplatePreview'

const productStarterTable = `| Product name | Qty | Offer price | MRP | OEM |
| --- | --- | --- | --- | --- |
| {{product.name}} | {{product.quantity}} | {{product.offerPrice}} | {{product.mrp}} | {{product.oem}} |`

export function TemplatesCard() {
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

  function insertText(text: string) {
    const el = bodyRef.current
    if (!el) {
      setBody((current) => `${current}${text}`)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    setBody(`${body.slice(0, start)}${text}${body.slice(end)}`)
    const caret = start + text.length
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
              <button key={item.key} type="button" className="pill" disabled={busy} onClick={() => insertText(`{{${item.key}}}`)}>
                {`{{${item.key}}}`}
              </button>
            ))}
            <button type="button" className="pill" disabled={busy} onClick={() => insertText(productStarterTable)}>
              Products
            </button>
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
