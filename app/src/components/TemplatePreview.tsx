import { useEffect } from 'react'

export function TemplatePreview({ html, onClose }: { html: string; onClose: () => void }) {
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
