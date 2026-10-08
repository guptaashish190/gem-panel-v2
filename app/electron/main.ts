import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { copyFile, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createLister, searchKeyword } from './gem.js'
import * as files from './files.js'
import { parsePdf } from './parse.js'
import * as store from './store.js'
import { mergeNamedPdfs, pdfDownloadName } from './merge.js'
import {
  companyValues,
  customFieldsOf,
  isLogoData,
  PLACEHOLDERS,
  placeholdersFor,
  renderTemplateDocument,
} from './template.js'
import {
  GEM_PDF_NAME,
  isTenderStatus,
  UNREACHABLE,
  type CompanyFields,
  type ListFilters,
  type ListScreen,
  type TemplateDownload,
  type TemplatePrint,
} from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type AppConfig = {
  gemBaseUrl: string
  supabaseUrl: string
  supabaseServiceKey: string
}

function loadConfig(): AppConfig {
  const fallback: AppConfig = {
    gemBaseUrl: 'https://bidplus.gem.gov.in',
    supabaseUrl: '',
    supabaseServiceKey: '',
  }
  try {
    const raw = JSON.parse(readFileSync(path.join(__dirname, '../config.json'), 'utf8')) as Partial<AppConfig>
    return {
      gemBaseUrl: raw.gemBaseUrl?.trim() || fallback.gemBaseUrl,
      supabaseUrl: raw.supabaseUrl?.trim() ?? '',
      supabaseServiceKey: raw.supabaseServiceKey?.trim() ?? '',
    }
  } catch {
    return fallback
  }
}

const config = loadConfig()

function recordsConfig(): { url: string; key: string } | null {
  if (!config.supabaseUrl || !config.supabaseServiceKey) return null
  return { url: config.supabaseUrl, key: config.supabaseServiceKey }
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

const lister = createLister(fetch, config.gemBaseUrl)
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

function notifyRows(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('tender-row')
  }
}

function windowWebPreferences() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
  }
}

function loadApp(win: BrowserWindow, bidNumber?: string): void {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    const url = new URL(devUrl)
    if (bidNumber) url.searchParams.set('bid', bidNumber)
    void win.loadURL(url.toString())
    return
  }
  void win.loadFile(path.join(__dirname, '../dist/index.html'), bidNumber ? { query: { bid: bidNumber } } : undefined)
}

function register(): void {
  ipcMain.handle('reachable', () => {
    if (!records()) return { ok: false as const, message: UNREACHABLE }
    return { ok: true as const }
  })

  ipcMain.handle('list', async (_event, screen: unknown, filters: unknown) => {
    const db = records()
    if (!db) return []
    return store.listTenders(db, dataRoot(), screenOf(screen), filtersOf(filters))
  })

  ipcMain.handle('fetch', (event: IpcMainInvokeEvent, keyword: unknown, pages: unknown, mode: unknown) => {
    const db = records()
    const trimmed = typeof keyword === 'string' ? keyword.trim() : ''
    const next = mode === 'next'
    const pageCount = next
      ? 1
      : typeof pages === 'number' && Number.isFinite(pages)
        ? Math.max(1, Math.floor(pages))
        : 1
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
            onProgress: (event) => {
              if (!sender.isDestroyed()) sender.send('fetch-progress', event)
            },
          },
          trimmed,
          pageCount,
          next ? 'next' : 'slate',
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

  ipcMain.handle('open-window', (_event, bidNumber: unknown) => {
    if (typeof bidNumber !== 'string' || !bidNumber.trim()) return false
    createDetailWindow(bidNumber)
    return true
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
    notifyRows()
    return true
  })

  ipcMain.handle('unsave', async (_event, bidNumber: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string') return false
    await files.applyUnsave(dataRoot(), bidNumber, {
      setSaved: (bid, saved) => store.setSaved(db, bid, saved),
      savedBidNumbers: () => store.savedBidNumbers(db),
    })
    notifyRows()
    return true
  })

  ipcMain.handle('delete-tender', async (_event, bidNumber: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string') return false
    try {
      await store.deleteTender(db, bidNumber)
      await files.removeBidDir(dataRoot(), bidNumber)
      notifyRows()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('reanalyze', async (_event, bidNumber: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string') return false
    try {
      let bytes = await files.readGemPdf(dataRoot(), bidNumber)
      if (!bytes) {
        const key = await store.storageKey(db, bidNumber, GEM_PDF_NAME).catch(() => null)
        if (key) bytes = await store.readStored(db, key).catch(() => null)
      }
      if (!bytes) return false
      await store.fillParsed(db, bidNumber, await parsePdf(bytes), { replaceDocuments: true })
      notifyRows()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('set-status', async (_event, bidNumber: unknown, status: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string' || (status !== null && !isTenderStatus(status))) return false
    await store.setStatus(db, bidNumber, status)
    notifyRows()
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
      notifyRows()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('open-local', async (_event, bidNumber: unknown, name: unknown) => {
    if (typeof bidNumber !== 'string' || typeof name !== 'string') return false
    const file = await files.localDocumentPath(dataRoot(), bidNumber, name)
    if (!file) return false
    return (await shell.openPath(file)) === ''
  })

  ipcMain.handle('download', async (_event, bidNumber: unknown, name: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string' || typeof name !== 'string') return false
    const key = await store.storageKey(db, bidNumber, name).catch(() => null)
    const extension = storedExtension(key)
    return files.deliverMissingFile({
      storedKey: key,
      readStored: (storedKey) => store.readStored(db, storedKey),
      writeLocal: async (bytes) => {
        await files.writeDocument(dataRoot(), bidNumber, name, bytes, extension)
      },
    })
  })

  ipcMain.handle('export-document', async (event, bidNumber: unknown, name: unknown) => {
    if (typeof bidNumber !== 'string' || typeof name !== 'string') return 'failed' satisfies TemplateDownload
    const source = await files.localDocumentPath(dataRoot(), bidNumber, name)
    return saveCopy(event, source)
  })

  ipcMain.handle('company', async () => {
    const db = records()
    if (!db) return null
    try {
      return await store.loadCompany(db, dataRoot())
    } catch {
      return null
    }
  })

  ipcMain.handle('save-company', async (_event, fields: unknown) => {
    const db = records()
    const next = companyFieldsOf(fields)
    if (!db || !next) return false
    try {
      await store.saveCompany(db, next)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('add-company-document', async (_event, name: unknown) => {
    const db = records()
    if (!db || typeof name !== 'string') return false
    try {
      return await store.addCompanyDocument(db, name)
    } catch {
      return false
    }
  })

  ipcMain.handle('remove-company-document', async (_event, name: unknown) => {
    const db = records()
    if (!db || typeof name !== 'string' || !name.trim()) return false
    try {
      await store.removeCompanyDocument(db, name)
      await files.removeCompanyDocumentFiles(dataRoot(), name)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('upload-company-document', async (_event, name: unknown, data: unknown, filename: unknown) => {
    const db = records()
    if (!db || typeof name !== 'string' || !name.trim()) return false
    const bytes = data instanceof Uint8Array ? data : null
    if (!bytes) return false
    const extension = extensionOf(filename)
    const storedName = extension ? `${files.documentFileName(name)}${extension}` : files.documentFileName(name)
    const key = `company/${storedName}`
    try {
      await store.uploadCompanyStored(db, name, key, bytes, contentType(extension))
      await files.writeCompanyDocument(dataRoot(), name, bytes, extension)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('open-company-document', async (_event, name: unknown) => {
    if (typeof name !== 'string') return false
    const file = await files.localCompanyDocumentPath(dataRoot(), name)
    if (!file) return false
    return (await shell.openPath(file)) === ''
  })

  ipcMain.handle('templates', async () => {
    const db = records()
    if (!db) return null
    try {
      return await store.listTemplates(db)
    } catch {
      return null
    }
  })

  ipcMain.handle('template-placeholders', async () => {
    const db = records()
    if (!db) return PLACEHOLDERS
    try {
      const company = await store.loadCompany(db, dataRoot())
      return placeholdersFor(company.fields)
    } catch {
      return PLACEHOLDERS
    }
  })

  ipcMain.handle('preview-template-text', async (_event, body: unknown) => {
    if (typeof body !== 'string') return null
    try {
      const db = records()
      if (!db) return renderTemplateDocument(body, {})
      const company = await store.loadCompany(db, dataRoot())
      return renderTemplateDocument(body, companyValues(company), company.logo)
    } catch {
      try {
        return renderTemplateDocument(body, {})
      } catch {
        return null
      }
    }
  })

  ipcMain.handle('save-template', async (_event, fields: unknown) => {
    const db = records()
    const next = templateInputOf(fields)
    if (!db || !next) return false
    try {
      return await store.saveTemplate(db, next)
    } catch {
      return false
    }
  })

  ipcMain.handle('remove-template', async (_event, id: unknown) => {
    const db = records()
    const templateId = idOf(id)
    if (!db || templateId == null) return false
    try {
      await store.removeTemplate(db, templateId)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('preview-template', async (_event, id: unknown, bidNumber: unknown) => {
    const db = records()
    const templateId = idOf(id)
    if (!db || templateId == null || typeof bidNumber !== 'string') return null
    try {
      return await store.previewTemplate(db, dataRoot(), templateId, bidNumber)
    } catch {
      return null
    }
  })

  ipcMain.handle('render-template', async (_event, id: unknown, values: unknown) => {
    const db = records()
    const templateId = idOf(id)
    const checked = templateValuesOf(values)
    if (!db || templateId == null || !checked) return null
    try {
      const template = await store.templateById(db, templateId)
      if (!template) return null
      return renderTemplateDocument(template.body, checked, await store.companyLogo(db))
    } catch {
      return null
    }
  })

  ipcMain.handle('save-template-document', async (_event, id: unknown, bidNumber: unknown, documentName: unknown, values: unknown) => {
    const db = records()
    const templateId = idOf(id)
    const checked = templateValuesOf(values)
    if (
      !db ||
      templateId == null ||
      typeof bidNumber !== 'string' ||
      typeof documentName !== 'string' ||
      !documentName.trim() ||
      documentName === GEM_PDF_NAME ||
      !checked
    ) {
      return false
    }
    try {
      const template = await store.templateById(db, templateId)
      if (!template) return false
      const document = renderTemplateDocument(template.body, checked, await store.companyLogo(db))
      const bytes = new Uint8Array(Buffer.from(document, 'utf8'))
      const extension = '.doc'
      const storedName = `${files.documentFileName(documentName)}${extension}`
      const key = `${files.bidDirName(bidNumber)}/${storedName}`
      await store.uploadStored(db, bidNumber, documentName, key, bytes, 'application/msword')
      await files.writeDocument(dataRoot(), bidNumber, documentName, bytes, extension)
      notifyRows()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('merge-document', async (_event, bidNumber: unknown, documentName: unknown, sources: unknown) => {
    const db = records()
    if (!db || typeof bidNumber !== 'string' || typeof documentName !== 'string') {
      return { ok: false, message: 'Could not merge those PDFs.' }
    }
    const merged = await collectMerge(db, documentName, sources)
    if (!merged.ok) return merged
    try {
      const extension = '.pdf'
      const storedName = `${files.documentFileName(documentName)}${extension}`
      const key = `${files.bidDirName(bidNumber)}/${storedName}`
      await store.uploadStored(db, bidNumber, documentName, key, merged.bytes, 'application/pdf')
      await files.writeDocument(dataRoot(), bidNumber, documentName, merged.bytes, extension)
      notifyRows()
      return { ok: true }
    } catch {
      return { ok: false, message: 'Could not save that document.' }
    }
  })

  ipcMain.handle('merge-download', async (event, bidNumber: unknown, documentName: unknown, sources: unknown) => {
    const db = records()
    const parts = mergeSourcesOf(sources)
    if (
      !db ||
      typeof bidNumber !== 'string' ||
      typeof documentName !== 'string' ||
      !documentName.trim() ||
      documentName === GEM_PDF_NAME ||
      !parts
    ) {
      return { ok: false, message: 'Could not merge those PDFs.' }
    }
    if (parts.length === 0) return { ok: false, message: 'Add at least one PDF.' }
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        defaultPath: pdfDownloadName(documentName, bidNumber),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      }
      const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (picked.canceled || !picked.filePath) return { ok: false, cancelled: true }
      const merged = await collectMerge(db, documentName, sources)
      if (!merged.ok) return merged
      const filePath = /\.pdf$/i.test(picked.filePath) ? picked.filePath : `${picked.filePath}.pdf`
      await writeFile(filePath, merged.bytes)
      return { ok: true }
    } catch {
      return { ok: false, message: 'Could not download that file.' }
    }
  })

  ipcMain.handle('download-template', async (event, id: unknown, bidNumber: unknown, values: unknown) => {
    const db = records()
    const templateId = idOf(id)
    const checked = templateValuesOf(values)
    if (!db || templateId == null || typeof bidNumber !== 'string' || !checked) return 'failed' satisfies TemplateDownload
    try {
      const template = await store.templateById(db, templateId)
      if (!template) return 'failed' satisfies TemplateDownload
      const document = renderTemplateDocument(template.body, checked, await store.companyLogo(db))
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        defaultPath: templateFileName(template.name, bidNumber),
        filters: [{ name: 'Word', extensions: ['doc'] }],
      }
      const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (picked.canceled || !picked.filePath) return 'cancelled' satisfies TemplateDownload
      const filePath = /\.doc$/i.test(picked.filePath) ? picked.filePath : `${picked.filePath}.doc`
      await writeFile(filePath, document, 'utf8')
      return 'saved' satisfies TemplateDownload
    } catch {
      return 'failed' satisfies TemplateDownload
    }
  })

  ipcMain.handle('print-template', async (_event, id: unknown, values: unknown) => {
    const db = records()
    const templateId = idOf(id)
    const checked = templateValuesOf(values)
    if (!db || templateId == null || !checked) return 'failed' satisfies TemplatePrint
    try {
      const template = await store.templateById(db, templateId)
      if (!template) return 'failed' satisfies TemplatePrint
      const document = renderTemplateDocument(template.body, checked, await store.companyLogo(db))
      return await printDocument(document)
    } catch {
      return 'failed' satisfies TemplatePrint
    }
  })

  ipcMain.handle('export-company-document', async (event, name: unknown) => {
    if (typeof name !== 'string') return 'failed' satisfies TemplateDownload
    const source = await files.localCompanyDocumentPath(dataRoot(), name)
    return saveCopy(event, source)
  })

  ipcMain.handle('download-company-document', async (_event, name: unknown) => {
    const db = records()
    if (!db || typeof name !== 'string') return false
    const key = await store.companyStorageKey(db, name).catch(() => null)
    const extension = storedExtension(key)
    return files.deliverMissingFile({
      storedKey: key,
      readStored: (storedKey) => store.readStored(db, storedKey),
      writeLocal: async (bytes) => {
        await files.writeCompanyDocument(dataRoot(), name, bytes, extension)
      },
    })
  })
}

function companyFieldsOf(value: unknown): CompanyFields | null {
  if (!value || typeof value !== 'object') return null
  const fields = value as Record<string, unknown>
  if (
    typeof fields.name !== 'string' ||
    typeof fields.signatory !== 'string' ||
    typeof fields.address !== 'string' ||
    typeof fields.drugLicenseNumber !== 'string' ||
    typeof fields.gstin !== 'string' ||
    typeof fields.email !== 'string' ||
    typeof fields.phone !== 'string' ||
    typeof fields.udyamNumber !== 'string' ||
    typeof fields.logo !== 'string'
  ) {
    return null
  }
  const logo = fields.logo.trim()
  if (logo && !isLogoData(logo)) return null
  const custom = customFieldsOf(fields.fields)
  if (!custom) return null
  return {
    name: fields.name.trim(),
    signatory: fields.signatory.trim(),
    address: fields.address.trim(),
    drugLicenseNumber: fields.drugLicenseNumber.trim(),
    gstin: fields.gstin.trim(),
    email: fields.email.trim(),
    phone: fields.phone.trim(),
    udyamNumber: fields.udyamNumber.trim(),
    logo,
    fields: custom,
  }
}

async function printDocument(html: string): Promise<TemplatePrint> {
  const filePath = path.join(app.getPath('temp'), `gem-print-${randomBytes(8).toString('hex')}.html`)
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false },
  })
  try {
    await writeFile(filePath, html, 'utf8')
    await win.loadFile(filePath)
    return await new Promise((resolve) => {
      win.webContents.print({}, (success, failureReason) => {
        if (success) resolve('printed')
        else if (/cancel/i.test(failureReason)) resolve('cancelled')
        else resolve('failed')
      })
    })
  } catch {
    return 'failed'
  } finally {
    if (!win.isDestroyed()) win.close()
    await unlink(filePath).catch(() => {})
  }
}

async function saveCopy(event: IpcMainInvokeEvent, source: string | null): Promise<TemplateDownload> {
  if (!source) return 'failed'
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const extension = path.extname(source).replace(/^\./, '')
    const options = {
      defaultPath: path.basename(source),
      filters: extension ? [{ name: extension, extensions: [extension] }] : undefined,
    }
    const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (picked.canceled || !picked.filePath) return 'cancelled'
    await copyFile(source, picked.filePath)
    return 'saved'
  } catch {
    return 'failed'
  }
}

type MergeOutcome = { ok: true; bytes: Uint8Array } | { ok: false; message: string }

async function collectMerge(db: SupabaseClient, documentName: unknown, sources: unknown): Promise<MergeOutcome> {
  const parts = mergeSourcesOf(sources)
  if (typeof documentName !== 'string' || !documentName.trim() || documentName === GEM_PDF_NAME || !parts) {
    return { ok: false, message: 'Could not merge those PDFs.' }
  }
  if (parts.length === 0) return { ok: false, message: 'Add at least one PDF.' }
  const named: { name: string; bytes: Uint8Array }[] = []
  for (const part of parts) {
    if (part.kind === 'upload') {
      named.push({ name: part.name.trim() || 'PDF', bytes: part.data })
      continue
    }
    const bytes = await readCompanyPdf(db, part.name)
    if (!bytes) return { ok: false, message: `${part.name} could not be read.` }
    named.push({ name: part.name, bytes })
  }
  return mergeNamedPdfs(named)
}

type MergeSourceInput = { kind: 'company'; name: string } | { kind: 'upload'; name: string; data: Uint8Array }

function mergeSourcesOf(value: unknown): MergeSourceInput[] | null {
  if (!Array.isArray(value)) return null
  const sources: MergeSourceInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    if (row.kind === 'company' && typeof row.name === 'string' && row.name.trim()) {
      sources.push({ kind: 'company', name: row.name.trim() })
      continue
    }
    if (row.kind === 'upload' && typeof row.name === 'string' && row.data instanceof Uint8Array) {
      sources.push({ kind: 'upload', name: row.name, data: row.data })
      continue
    }
    return null
  }
  return sources
}

async function readCompanyPdf(db: SupabaseClient, name: string): Promise<Uint8Array | null> {
  try {
    const root = dataRoot()
    let file = await files.localCompanyDocumentPath(root, name)
    if (!file) {
      const key = await store.companyStorageKey(db, name)
      const delivered = await files.deliverMissingFile({
        storedKey: key,
        readStored: (storedKey) => store.readStored(db, storedKey),
        writeLocal: async (bytes) => {
          await files.writeCompanyDocument(root, name, bytes, storedExtension(key))
        },
      })
      if (!delivered) return null
      file = await files.localCompanyDocumentPath(root, name)
    }
    if (!file) return null
    return new Uint8Array(await readFile(file))
  } catch {
    return null
  }
}

function storedExtension(key: string | null): string {
  if (!key) return ''
  const extension = path.extname(key).toLowerCase()
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ''
}

function idOf(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null
  return value
}

function templateInputOf(value: unknown): { id: number | null; name: string; body: string } | null {
  if (!value || typeof value !== 'object') return null
  const fields = value as Record<string, unknown>
  if (typeof fields.name !== 'string' || typeof fields.body !== 'string') return null
  if (fields.id != null && idOf(fields.id) == null) return null
  return {
    id: fields.id == null ? null : idOf(fields.id),
    name: fields.name,
    body: fields.body,
  }
}

function templateValuesOf(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key) || typeof item !== 'string') return null
    result[key] = item
  }
  return result
}

function templateFileName(name: string, bidNumber: string): string {
  const cleaned = `${name} ${bidNumber}`.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
  return `${cleaned || 'template'}.doc`
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#ffffff',
    title: 'GeM Tender Panel',
    show: false,
    webPreferences: windowWebPreferences(),
  })
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })
  loadApp(win)
}

function createDetailWindow(bidNumber: string): void {
  const win = new BrowserWindow({
    width: 980,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#ffffff',
    title: bidNumber,
    show: false,
    webPreferences: windowWebPreferences(),
  })
  win.once('ready-to-show', () => {
    win.show()
  })
  loadApp(win, bidNumber)
}

async function repairParsed(): Promise<void> {
  const db = records()
  if (!db) return
  const [missingEval, needingProducts] = await Promise.all([
    store.bidsMissingEvaluation(db).catch(() => [] as string[]),
    store.bidsNeedingProducts(db).catch(() => [] as string[]),
  ])
  const bids = [...new Set([...missingEval, ...needingProducts])]
  let changed = false
  for (const bid of bids) {
    const bytes = await files.readGemPdf(dataRoot(), bid)
    if (!bytes) continue
    try {
      const parsed = await parsePdf(bytes)
      if (!parsed.evaluationMethod && parsed.products.length === 0 && parsed.mse == null && parsed.emdAmount == null) continue
      await store.fillParsed(db, bid, parsed)
      changed = true
    } catch {
      // leave the row; a later open still has the file
    }
  }
  if (!changed) return
  notifyRows()
}

app.whenReady().then(() => {
  register()
  createWindow()
  void repairParsed()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
