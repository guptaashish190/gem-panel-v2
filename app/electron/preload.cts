import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('panel', {
  reachable: () => ipcRenderer.invoke('reachable'),
  list: (screen: string, filters: unknown) => ipcRenderer.invoke('list', screen, filters),
  fetch: (keyword: string, pages: number, mode?: 'slate' | 'next') =>
    ipcRenderer.invoke('fetch', keyword, pages, mode),
  open: (bidNumber: string) => ipcRenderer.invoke('open', bidNumber),
  openWindow: (bidNumber: string) => ipcRenderer.invoke('open-window', bidNumber),
  save: (bidNumber: string) => ipcRenderer.invoke('save', bidNumber),
  unsave: (bidNumber: string) => ipcRenderer.invoke('unsave', bidNumber),
  setStatus: (bidNumber: string, status: string) => ipcRenderer.invoke('set-status', bidNumber, status),
  deleteTender: (bidNumber: string) => ipcRenderer.invoke('delete-tender', bidNumber),
  upload: (bidNumber: string, name: string, data: Uint8Array, filename: string) =>
    ipcRenderer.invoke('upload', bidNumber, name, data, filename),
  download: (bidNumber: string, name: string) => ipcRenderer.invoke('download', bidNumber, name),
  exportDocument: (bidNumber: string, name: string) => ipcRenderer.invoke('export-document', bidNumber, name),
  openLocal: (bidNumber: string, name: string) => ipcRenderer.invoke('open-local', bidNumber, name),
  company: () => ipcRenderer.invoke('company'),
  saveCompany: (fields: unknown) => ipcRenderer.invoke('save-company', fields),
  addCompanyDocument: (name: string) => ipcRenderer.invoke('add-company-document', name),
  removeCompanyDocument: (name: string) => ipcRenderer.invoke('remove-company-document', name),
  uploadCompanyDocument: (name: string, data: Uint8Array, filename: string) =>
    ipcRenderer.invoke('upload-company-document', name, data, filename),
  downloadCompanyDocument: (name: string) => ipcRenderer.invoke('download-company-document', name),
  exportCompanyDocument: (name: string) => ipcRenderer.invoke('export-company-document', name),
  openCompanyDocument: (name: string) => ipcRenderer.invoke('open-company-document', name),
  templates: () => ipcRenderer.invoke('templates'),
  templatePlaceholders: () => ipcRenderer.invoke('template-placeholders'),
  saveTemplate: (fields: unknown) => ipcRenderer.invoke('save-template', fields),
  removeTemplate: (id: number) => ipcRenderer.invoke('remove-template', id),
  previewTemplate: (id: number, bidNumber: string) => ipcRenderer.invoke('preview-template', id, bidNumber),
  previewTemplateText: (body: string) => ipcRenderer.invoke('preview-template-text', body),
  renderTemplate: (id: number, values: Record<string, string>) => ipcRenderer.invoke('render-template', id, values),
  saveTemplateDocument: (id: number, bidNumber: string, documentName: string, values: Record<string, string>) =>
    ipcRenderer.invoke('save-template-document', id, bidNumber, documentName, values),
  mergeDocument: (bidNumber: string, documentName: string, sources: unknown) =>
    ipcRenderer.invoke('merge-document', bidNumber, documentName, sources),
  mergeDownload: (bidNumber: string, documentName: string, sources: unknown) =>
    ipcRenderer.invoke('merge-download', bidNumber, documentName, sources),
  downloadTemplate: (id: number, bidNumber: string, values: Record<string, string>) =>
    ipcRenderer.invoke('download-template', id, bidNumber, values),
  onRow: (listener: () => void) => {
    const wrapped = () => listener()
    ipcRenderer.on('tender-row', wrapped)
    return () => ipcRenderer.removeListener('tender-row', wrapped)
  },
  onFetchDone: (listener: () => void) => {
    const wrapped = () => listener()
    ipcRenderer.on('fetch-done', wrapped)
    return () => ipcRenderer.removeListener('fetch-done', wrapped)
  },
  onFetchProgress: (listener: (event: unknown) => void) => {
    const wrapped = (_event: unknown, progress: unknown) => listener(progress)
    ipcRenderer.on('fetch-progress', wrapped)
    return () => ipcRenderer.removeListener('fetch-progress', wrapped)
  },
})
