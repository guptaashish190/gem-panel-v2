import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('panel', {
  reachable: () => ipcRenderer.invoke('reachable'),
  list: (screen: string, filters: unknown) => ipcRenderer.invoke('list', screen, filters),
  fetch: (keyword: string, pages: number) => ipcRenderer.invoke('fetch', keyword, pages),
  open: (bidNumber: string) => ipcRenderer.invoke('open', bidNumber),
  save: (bidNumber: string) => ipcRenderer.invoke('save', bidNumber),
  unsave: (bidNumber: string) => ipcRenderer.invoke('unsave', bidNumber),
  markFilled: (bidNumber: string) => ipcRenderer.invoke('mark-filled', bidNumber),
  upload: (bidNumber: string, name: string, data: Uint8Array, filename: string) =>
    ipcRenderer.invoke('upload', bidNumber, name, data, filename),
  download: (bidNumber: string, name: string) => ipcRenderer.invoke('download', bidNumber, name),
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
})
