import type { TenderDetail } from '../panel'

export function DocumentsSection({
  bidNumber,
  documents,
  onReload,
  onPrepare,
}: {
  bidNumber: string
  documents: TenderDetail['documents']
  onReload: () => void
  onPrepare: (name: string) => void
}) {
  return (
    <section className="block">
      <h2>Documents</h2>
      {documents.length === 0 ? <p className="empty">No documents required on this tender.</p> : null}
      {documents.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th className="end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.name} className={doc.action === 'download' ? 'warn' : doc.action === 'ready' ? 'ready' : ''}>
                  <td>{doc.name}</td>
                  <td className="end">
                    <div className="doc-actions">
                      {doc.action === 'ready' && doc.filename ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          title={doc.filename}
                          onClick={() => void window.panel?.openLocal(bidNumber, doc.name)}
                        >
                          {doc.filename}
                        </button>
                      ) : null}
                      {doc.action === 'ready' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          aria-label="Download"
                          title="Download"
                          onClick={() => void window.panel?.exportDocument(bidNumber, doc.name)}
                        >
                          <DownloadIcon />
                        </button>
                      ) : null}
                      {doc.action === 'download' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          aria-label="Download"
                          title="Download"
                          onClick={() => {
                            void window.panel?.download(bidNumber, doc.name)?.then((ok) => {
                              if (ok) onReload()
                            })
                          }}
                        >
                          <DownloadIcon />
                        </button>
                      ) : null}
                      {doc.action === 'ready' || doc.action === 'upload' ? (
                        <UploadFile onFile={(file) => uploadDocument(bidNumber, doc.name, file, onReload)} />
                      ) : null}
                      {doc.template ? (
                        <button type="button" className="btn btn-prepare" onClick={() => onPrepare(doc.name)}>
                          Prepare
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

function uploadDocument(bidNumber: string, name: string, file: File, done: () => void) {
  if (!window.panel) return
  void file.arrayBuffer().then((buffer) =>
    window.panel?.upload(bidNumber, name, new Uint8Array(buffer), file.name)?.then((ok) => {
      if (ok) done()
    }),
  )
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 2v7m0 0L5.5 6.5M8 9l2.5-2.5M3 11.5V13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function UploadFile({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="btn btn-upload">
      Upload
      <input
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
    </label>
  )
}
