import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createLister, searchKeyword } from './gem.js'
import * as files from './files.js'
import { parsePdf } from './parse.js'
import * as store from './store.js'
import { GEM_PDF_NAME, UNREACHABLE, type ListFilters, type ListScreen } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function recordsConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_KEY?.trim()
  if (!url || !key) return null
  return { url, key }
}

let client: SupabaseClient | null = null

function records(): SupabaseClient | null {
  const config = recordsConfig()
  if (!config) {
    client = null
    return null
  }
  if (!client) {
    client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

function dataRoot(): string {
  return app.getPath('userData')
}

const lister = createLister()
let fetchChain: Promise<void> = Promise.resolve()
let fetchesRunning = 0

function screenOf(value: unknown): ListScreen {
  if (value === 'saved' || value === 'filled') return value
  return 'search'
}

function filtersOf(value: unknown): ListFilters {
  const filters = (value ?? {}) as ListFilters
  return {
    ministryOrState: typeof filters.ministryOrState === 'string' ? filters.ministryOrState : '',
    evaluationMethod: typeof filters.evaluationMethod === 'string' ? filters.evaluationMethod : '',
    mse: filters.mse === true || filters.mse === false ? filters.mse : null,
    emd: filters.emd === true || filters.emd === false ? filters.emd : null,
  }
}

function extensionOf(filename: unknown): string {
  if (typeof filename !== 'string') return ''
  const match = path.extname(filename).toLowerCase().match(/^\.[a-z0-9]{1,8}$/)
  return match?.[0] ?? ''
}

function contentType(extension: string): string {
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

function register(): void {
  ipcMain.handle('reachable', () => {
    if (!records()) return { ok: false as const, message: UNREACHABLE }
    return { ok: true as const }
  })

  ipcMain.handle('list', async (_event, screen: unknown, filters: unknown) => {
    const db = records()
    if (!db) return []
    return store.listTenders(db, screenOf(screen), filtersOf(filters))
  })

  ipcMain.handle('fetch', (event: IpcMainInvokeEvent, keyword: unknown, pages: unknown) => {
    const db = records()
    const trimmed = typeof keyword === 'string' ? keyword.trim() : ''
    const pageCount = typeof pages === 'number' && Number.isFinite(pages) ? Math.max(1, Math.floor(pages)) : 1
    if (!db || !trimmed) return { started: false }
    const sender = event.sender
    fetchesRunning += 1
    fetchChain = fetchChain
      .then(() =>
        searchKeyword(
          {
            pagesSearched: (key) => store.pagesSearched(db, key),
            setPagesSearched: (key, count) => store.setPagesSearched(db, key, count),
            listPage: (key, page) => lister.listPage(key, page),
            downloadPdf: (listingId) => lister.downloadPdf(listingId),
            hasBid: (bidNumber) => store.hasBid(db, bidNumber),
            unsavedCount: async () => files.countUnsaved(dataRoot(), await store.savedBidNumbers(db)),
            savePdf: (bidNumber, bytes) => files.writeGemPdf(dataRoot(), bidNumber, bytes),
            removePdf: (bidNumber) => files.removeGemPdf(dataRoot(), bidNumber),
            parsePdf,
            insertTender: (row) => store.insertTender(db, row),
            onRow: () => {
              if (!sender.isDestroyed()) sender.send('tender-row')
            },
          },
          trimmed,
          pageCount,
        ),
      )
      .catch(() => undefined)
      .then(() => {
        fetchesRunning -= 1
        if (fetchesRunning === 0 && !sender.isDestroyed()) sender.send('fetch-done')
      })
    return { started: true }
  })

  ipcMain.handle('open', async (_event, bidNumber: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string') return null
    return store.openTender(db, dataRoot(), bidNumber)
  })

  ipcMain.handle('save', async (_event, bidNumber: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string') return false
    await store.setSaved(db, bidNumber, true)
    const bytes = await files.readGemPdf(dataRoot(), bidNumber)
    if (bytes) {
      const key = `${files.bidDirName(bidNumber)}/gem.pdf`
      void store.uploadStored(db, bidNumber, GEM_PDF_NAME, key, bytes, 'application/pdf').catch(() => undefined)
    }
    return true
  })

  ipcMain.handle('unsave', async (_event, bidNumber: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string') return false
    await files.applyUnsave(dataRoot(), bidNumber, {
      setSaved: (bid, saved) => store.setSaved(db, bid, saved),
      savedBidNumbers: () => store.savedBidNumbers(db),
    })
    return true
  })

  ipcMain.handle('mark-filled', async (_event, bidNumber: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string') return false
    await store.setFilled(db, bidNumber)
    return true
  })

  ipcMain.handle('upload', async (_event, bidNumber: unknown, name: unknown, data: unknown, filename: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string' || typeof name !== 'string' || name === GEM_PDF_NAME) return false
    const bytes = data instanceof Uint8Array ? data : null
    if (!bytes) return false
    const extension = extensionOf(filename)
    const storedName = extension ? `${files.documentFileName(name)}${extension}` : files.documentFileName(name)
    const key = `${files.bidDirName(bidNumber)}/${storedName}`
    try {
      await store.uploadStored(db, bidNumber, name, key, bytes, contentType(extension))
      await files.writeDocument(dataRoot(), bidNumber, name, bytes, extension)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('download', async (_event, bidNumber: unknown, name: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string' || typeof name !== 'string') return false
    const key = await store.storageKey(db, bidNumber, name).catch(() => null)
    return files.deliverMissingFile({
      storedKey: key,
      readStored: (storedKey) => store.readStored(db, storedKey),
      writeLocal: async (bytes) => {
        await files.writeDocument(dataRoot(), bidNumber, name, bytes)
      },
      downloadFromGem: () => Promise.reject(new Error('missing')),
    })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    title: 'GeM Tender Panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(() => {
  register()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
