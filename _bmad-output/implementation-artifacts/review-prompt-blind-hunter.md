Conduct a review of CONTENT.
Look for what's missing, not only what's wrong.
Compute your finding floor N from the diff file's size: N = min(floor(sqrt(kB) + 1), 10), where kB is the file's size in kilobytes. State the arithmetic in one line, then find at least N issues to fix or improve.
Output a Markdown list of findings only — no severity, priority, or ranking.
If the content is empty, stop and say so.
If you have zero findings, re-check and keep thinking; do not stop with an empty list.

CONTENT: the unified diff at `diff --git a/app/electron/main.ts b/app/electron/main.ts
index 8297330..544f078 100644
--- a/app/electron/main.ts
+++ b/app/electron/main.ts
@@ -1,6 +1,7 @@
 import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
 import { readFileSync } from 'node:fs'
-import { copyFile, readFile, writeFile } from 'node:fs/promises'
+import { randomBytes } from 'node:crypto'
+import { copyFile, readFile, unlink, writeFile } from 'node:fs/promises'
 import path from 'node:path'
 import { fileURLToPath } from 'node:url'
 import { createClient, type SupabaseClient } from '@supabase/supabase-js'
@@ -9,7 +10,7 @@ import * as files from './files.js'
 import { parsePdf } from './parse.js'
 import * as store from './store.js'
 import { mergeNamedPdfs, pdfDownloadName } from './merge.js'
-import { customFieldsOf, PLACEHOLDERS, placeholdersFor, renderTemplateDocument } from './template.js'
+import { customFieldsOf, isLogoData, PLACEHOLDERS, placeholdersFor, renderTemplateDocument } from './template.js'
 import {
   GEM_PDF_NAME,
   isTenderStatus,
@@ -18,6 +19,7 @@ import {
   type ListFilters,
   type ListScreen,
   type TemplateDownload,
+  type TemplatePrint,
 } from './types.js'
 
 const __dirname = path.dirname(fileURLToPath(import.meta.url))
@@ -448,7 +450,7 @@ function register(): void {
     try {
       const template = await store.templateById(db, templateId)
       if (!template) return null
-      return renderTemplateDocument(template.body, checked)
+      return renderTemplateDocument(template.body, checked, await store.companyLogo(db))
     } catch {
       return null
     }
@@ -472,7 +474,7 @@ function register(): void {
     try {
       const template = await store.templateById(db, templateId)
       if (!template) return false
-      const document = renderTemplateDocument(template.body, checked)
+      const document = renderTemplateDocument(template.body, checked, await store.companyLogo(db))
       const bytes = new Uint8Array(Buffer.from(document, 'utf8'))
       const extension = '.doc'
       const storedName = `${files.documentFileName(documentName)}${extension}`
@@ -546,7 +548,7 @@ function register(): void {
     try {
       const template = await store.templateById(db, templateId)
       if (!template) return 'failed' satisfies TemplateDownload
-      const document = renderTemplateDocument(template.body, checked)
+      const document = renderTemplateDocument(template.body, checked, await store.companyLogo(db))
       const win = BrowserWindow.fromWebContents(event.sender)
       const options = {
         defaultPath: templateFileName(template.name, bidNumber),
@@ -562,6 +564,21 @@ function register(): void {
     }
   })
 
+  ipcMain.handle('print-template', async (_event, id: unknown, values: unknown) => {
+    const db = records()
+    const templateId = idOf(id)
+    const checked = templateValuesOf(values)
+    if (!db || templateId == null || !checked) return 'failed' satisfies TemplatePrint
+    try {
+      const template = await store.templateById(db, templateId)
+      if (!template) return 'failed' satisfies TemplatePrint
+      const document = renderTemplateDocument(template.body, checked, await store.companyLogo(db))
+      return await printDocument(document)
+    } catch {
+      return 'failed' satisfies TemplatePrint
+    }
+  })
+
   ipcMain.handle('export-company-document', async (event, name: unknown) => {
     if (typeof name !== 'string') return 'failed' satisfies TemplateDownload
     const source = await files.localCompanyDocumentPath(dataRoot(), name)
@@ -594,10 +611,13 @@ function companyFieldsOf(value: unknown): CompanyFields | null {
     typeof fields.gstin !== 'string' ||
     typeof fields.email !== 'string' ||
     typeof fields.phone !== 'string' ||
-    typeof fields.udyamNumber !== 'string'
+    typeof fields.udyamNumber !== 'string' ||
+    typeof fields.logo !== 'string'
   ) {
     return null
   }
+  const logo = fields.logo.trim()
+  if (logo && !isLogoData(logo)) return null
   const custom = customFieldsOf(fields.fields)
   if (!custom) return null
   return {
@@ -609,10 +629,35 @@ function companyFieldsOf(value: unknown): CompanyFields | null {
     email: fields.email.trim(),
     phone: fields.phone.trim(),
     udyamNumber: fields.udyamNumber.trim(),
+    logo,
     fields: custom,
   }
 }
 
+async function printDocument(html: string): Promise<TemplatePrint> {
+  const filePath = path.join(app.getPath('temp'), `gem-print-${randomBytes(8).toString('hex')}.html`)
+  const win = new BrowserWindow({
+    show: false,
+    webPreferences: { javascript: false },
+  })
+  try {
+    await writeFile(filePath, html, 'utf8')
+    await win.loadFile(filePath)
+    return await new Promise((resolve) => {
+      win.webContents.print({}, (success, failureReason) => {
+        if (success) resolve('printed')
+        else if (/cancel/i.test(failureReason)) resolve('cancelled')
+        else resolve('failed')
+      })
+    })
+  } catch {
+    return 'failed'
+  } finally {
+    if (!win.isDestroyed()) win.close()
+    await unlink(filePath).catch(() => {})
+  }
+}
+
 async function saveCopy(event: IpcMainInvokeEvent, source: string | null): Promise<TemplateDownload> {
   if (!source) return 'failed'
   try {
diff --git a/app/electron/preload.cts b/app/electron/preload.cts
index 720c353..1444288 100644
--- a/app/electron/preload.cts
+++ b/app/electron/preload.cts
@@ -41,6 +41,7 @@ contextBridge.exposeInMainWorld('panel', {
     ipcRenderer.invoke('merge-download', bidNumber, documentName, sources),
   downloadTemplate: (id: number, bidNumber: string, values: Record<string, string>) =>
     ipcRenderer.invoke('download-template', id, bidNumber, values),
+  printTemplate: (id: number, values: Record<string, string>) => ipcRenderer.invoke('print-template', id, values),
   onRow: (listener: () => void) => {
     const wrapped = () => listener()
     ipcRenderer.on('tender-row', wrapped)
diff --git a/app/electron/store.ts b/app/electron/store.ts
index cba426b..d351734 100644
--- a/app/electron/store.ts
+++ b/app/electron/store.ts
@@ -17,7 +17,7 @@ import {
   type TextTemplate,
 } from './types.js'
 import { documentIsLocal, fileAction, localCompanyDocumentPath, localDocumentFileName } from './files.js'
-import { companyFieldLabels, isReservedKey, templateFields, templateValues } from './template.js'
+import { companyFieldLabels, isLogoData, isReservedKey, templateFields, templateValues } from './template.js'
 
 type Query = {
   eq: (column: string, value: string | boolean) => Query
@@ -526,11 +526,26 @@ export async function loadCompany(client: SupabaseClient, root: string): Promise
     email: (row?.email as string | null) ?? '',
     phone: (row?.phone as string | null) ?? '',
     udyamNumber: (row?.udyam_number as string | null) ?? '',
+    logo: storedLogo(row?.logo),
     fields: storedCompanyFields(row?.fields),
     documents,
   }
 }
 
+export function storedLogo(value: unknown): string {
+  return typeof value === 'string' && isLogoData(value) ? value : ''
+}
+
+export async function companyLogo(client: SupabaseClient): Promise<string> {
+  try {
+    const { data, error } = await client.from('company').select('logo').eq('id', 1).maybeSingle()
+    if (error) return ''
+    return storedLogo(data?.logo)
+  } catch {
+    return ''
+  }
+}
+
 export function storedCompanyFields(value: unknown): CompanyField[] {
   if (!Array.isArray(value)) return []
   const fields: CompanyField[] = []
@@ -560,6 +575,7 @@ export async function saveCompany(client: SupabaseClient, fields: CompanyFields)
       email: fields.email,
       phone: fields.phone,
       udyam_number: fields.udyamNumber,
+      logo: fields.logo,
       fields: fields.fields.map((field) => ({ key: field.key, label: field.label, value: field.value })),
     },
     { onConflict: 'id' },
diff --git a/app/electron/template.test.ts b/app/electron/template.test.ts
index ff91bbc..4f20a83 100644
--- a/app/electron/template.test.ts
+++ b/app/electron/template.test.ts
@@ -1,7 +1,7 @@
 import assert from 'node:assert/strict'
 import { readFileSync } from 'node:fs'
 import { test } from 'node:test'
-import { storedCompanyFields } from './store.js'
+import { storedCompanyFields, storedLogo } from './store.js'
 import {
   companyFieldLabels,
   customFieldsOf,
@@ -12,6 +12,7 @@ import {
   PLACEHOLDERS,
   productStarterTable,
   productsLine,
+  isLogoData,
   renderTemplateDocument,
   RESERVED_KEYS,
   templateFields,
@@ -19,7 +20,7 @@ import {
   templateValues,
 } from './template.js'
 
-const company = { name: 'Acme', signatory: 'Ada', address: 'Pune', drugLicenseNumber: 'DL-1', gstin: '06GST', email: 'a@b.in', phone: '98', udyamNumber: 'UDYAM-1', fields: [] }
+const company = { name: 'Acme', signatory: 'Ada', address: 'Pune', drugLicenseNumber: 'DL-1', gstin: '06GST', email: 'a@b.in', phone: '98', udyamNumber: 'UDYAM-1', logo: '', fields: [] }
 
 function tender(products: { name: string; quantity: number | null }[]) {
   return {
@@ -102,7 +103,7 @@ test('products join name and quantity', () => {
 
 test('known values fill the matching tokens', () => {
   const values = templateValues(
-    { name: 'Acme', signatory: 'Ada', address: 'Pune', drugLicenseNumber: 'DL-1', gstin: '06GST', email: 'a@b.in', phone: '98', udyamNumber: 'UDYAM-1', fields: [] },
+    { name: 'Acme', signatory: 'Ada', address: 'Pune', drugLicenseNumber: 'DL-1', gstin: '06GST', email: 'a@b.in', phone: '98', udyamNumber: 'UDYAM-1', logo: '', fields: [] },
     {
       bidNumber: 'GEM/2026/B/1',
       bidEnd: '08-10-2026',
@@ -413,3 +414,72 @@ test('settings preview leaves product tokens when no bid is chosen', () => {
   assert.match(document, /\{\{product\.offerPrice\}\}/)
   assert.match(document, /\{\{product\.oem\}\}/)
 })
+
+const pngLogo = 'data:image/png;base64,aaaa'
+
+test('a logo renders as an image', () => {
+  const document = renderTemplateDocument('{{logo}}', {}, pngLogo)
+  assert.match(document, /<img src="data:image\/png;base64,aaaa" alt="Company logo" height="80"/)
+})
+
+test('an empty logo removes the token', () => {
+  const document = renderTemplateDocument('X{{logo}}Y', {}, '')
+  assert.match(document, /XY/)
+  assert.doesNotMatch(document, /\{\{logo\}\}/)
+  assert.doesNotMatch(document, /<img/)
+})
+
+test('a forged logo value is ignored', () => {
+  const document = renderTemplateDocument('{{logo}}', { logo: '<script>alert(1)</script>' }, pngLogo)
+  assert.match(document, /<img src="data:image\/png;base64,aaaa"/)
+  assert.doesNotMatch(document, /<script/)
+  assert.equal(Object.hasOwn(templateValues({ ...company, logo: pngLogo }, tender([])), 'logo'), false)
+})
+
+test('a bad stored logo renders nothing', () => {
+  const document = renderTemplateDocument('{{logo}}', {}, 'not-a-logo')
+  assert.doesNotMatch(document, /\{\{logo\}\}/)
+  assert.doesNotMatch(document, /<img/)
+  assert.equal(storedLogo('not-a-logo'), '')
+  assert.equal(storedLogo(undefined), '')
+  assert.equal(storedLogo(pngLogo), pngLogo)
+})
+
+test('settings preview leaves the logo token', () => {
+  const document = renderTemplateDocument('{{logo}}', {})
+  assert.match(document, /\{\{logo\}\}/)
+})
+
+test('logo is not a prepare field', () => {
+  const fields = templateFields('{{logo}} {{companyName}}', { companyName: 'Acme', logo: '<script>' })
+  assert.deepEqual(
+    fields.map((field) => field.key),
+    ['companyName'],
+  )
+})
+
+test('logo data accepts png and jpeg only, within the size cap', () => {
+  assert.equal(isLogoData(pngLogo), true)
+  assert.equal(isLogoData('data:image/jpeg;base64,+/=='), true)
+  assert.equal(isLogoData('data:image/gif;base64,aaaa'), false)
+  assert.equal(isLogoData('data:image/png;base64,<script>'), false)
+  assert.equal(isLogoData(''), false)
+  assert.equal(isLogoData(`data:image/png;base64,${'a'.repeat(700_000)}`), false)
+})
+
+test('settings refuses a logo that is not a small png or jpeg', () => {
+  const settings = readFileSync(new URL('../src/SettingsPanel.tsx', import.meta.url), 'utf8')
+  assert.match(settings, /Use a PNG or JPEG under 500 KB\./)
+  assert.match(settings, /image\/png/)
+  assert.match(settings, /image\/jpeg/)
+  assert.match(settings, /500 \* 1024/)
+})
+
+test('print reports failure and stays quiet when cancelled', () => {
+  const dialog = readFileSync(new URL('../src/TemplateDialog.tsx', import.meta.url), 'utf8')
+  assert.match(dialog, />\s*Print\s*</)
+  assert.match(dialog, /Could not print that document\./)
+  const handler = dialog.slice(dialog.indexOf('async function onPrint'), dialog.indexOf('async function onDownload'))
+  assert.match(handler, /result === 'failed'/)
+  assert.doesNotMatch(handler, /cancelled/)
+})
diff --git a/app/electron/template.ts b/app/electron/template.ts
index d3e1398..84291af 100644
--- a/app/electron/template.ts
+++ b/app/electron/template.ts
@@ -10,6 +10,7 @@ export const PLACEHOLDERS: TemplatePlaceholder[] = [
   { key: 'email', label: 'Email' },
   { key: 'phone', label: 'Phone number' },
   { key: 'udyamNumber', label: 'Udyam certificate number' },
+  { key: 'logo', label: 'Company logo' },
   { key: 'bidNumber', label: 'Bid number' },
   { key: 'bidEnd', label: 'Bid end' },
   { key: 'offerValidity', label: 'Offer validity' },
@@ -60,6 +61,13 @@ export const RESERVED_KEYS: string[] = [
   ...new Set([...PLACEHOLDERS.map((item) => item.key), ...TENDER_KEYS, 'products', 'productRows', 'product']),
 ]
 
+const LOGO_LIMIT = 700_000
+
+export function isLogoData(value: string): boolean {
+  if (value.length === 0 || value.length > LOGO_LIMIT) return false
+  return /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
+}
+
 export function isReservedKey(key: string): boolean {
   const lower = key.toLowerCase()
   return RESERVED_KEYS.some((item) => item.toLowerCase() === lower)
@@ -240,7 +248,7 @@ function expandPatternRows(body: string, rows: Record<string, string>[] | null,
       const cells = table.bodyCells.map((cell) =>
         cell.replace(productTokenPattern(), (_raw, key: string) => {
           const id = slots.length
-          slots.push(row[key] ?? '')
+          slots.push(htmlText(row[key] ?? ''))
           return `\uE000${id}\uE001`
         }),
       )
@@ -297,7 +305,7 @@ export function templateFields(
 ): TemplateField[] {
   const columns = patternColumns(body)
   const fields = templateTokens(body)
-    .filter((key) => columns.length === 0 || key !== 'productRows')
+    .filter((key) => key !== 'logo' && (columns.length === 0 || key !== 'productRows'))
     .map((key) => ({
       key,
       label: labels.get(key) ?? (Object.hasOwn(customLabels, key) ? customLabels[key] : key),
@@ -320,18 +328,29 @@ export function templateFields(
   return fields
 }
 
-export function renderTemplateDocument(body: string, values: Record<string, string>): string {
+function logoImage(logo: string): string {
+  if (!isLogoData(logo)) return ''
+  return `<img src="${logo}" alt="Company logo" height="80" style="height:80px;width:auto">`
+}
+
+export function renderTemplateDocument(body: string, values: Record<string, string>, logo?: string): string {
   const slots: string[] = []
   const parsedRows = Object.hasOwn(values, 'productRows') ? parseProductRows(values.productRows) : null
   const expanded = expandPatternRows(body, parsedRows ? parsedRows.rows : null, slots)
   const source = expanded.replace(tokenPattern(), (raw, key: string) => {
+    if (key === 'logo') {
+      if (typeof logo !== 'string') return raw
+      const id = slots.length
+      slots.push(logoImage(logo))
+      return `\uE000${id}\uE001`
+    }
     if (!Object.hasOwn(values, key)) return raw
     const id = slots.length
-    slots.push(values[key])
+    slots.push(htmlText(values[key]))
     return `\uE000${id}\uE001`
   })
   const html = marked(source, { async: false, gfm: true, breaks: true })
-  const filled = html.replace(/\uE000(\d+)\uE001/g, (_raw, index: string) => htmlText(slots[Number(index)] ?? ''))
+  const filled = html.replace(/\uE000(\d+)\uE001/g, (_raw, index: string) => slots[Number(index)] ?? '')
   return wordDocument(filled.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))
 }
 
diff --git a/app/electron/types.ts b/app/electron/types.ts
index c7162b9..91dfbd5 100644
--- a/app/electron/types.ts
+++ b/app/electron/types.ts
@@ -115,6 +115,7 @@ export type CompanyFields = {
   email: string
   phone: string
   udyamNumber: string
+  logo: string
   fields: CompanyField[]
 }
 
@@ -152,6 +153,8 @@ export type TemplatePreview = {
 
 export type TemplateDownload = 'saved' | 'cancelled' | 'failed'
 
+export type TemplatePrint = 'printed' | 'cancelled' | 'failed'
+
 export const UNREACHABLE = 'the panel cannot reach its records'
 export const FILE_BUCKET = 'tender-files'
 export const GEM_PDF_NAME = 'GeM PDF'
diff --git a/app/src/SettingsPanel.tsx b/app/src/SettingsPanel.tsx
index 6297cef..c69835b 100644
--- a/app/src/SettingsPanel.tsx
+++ b/app/src/SettingsPanel.tsx
@@ -13,6 +13,7 @@ const RESERVED_KEYS = [
   'email',
   'phone',
   'udyamNumber',
+  'logo',
   'bidNumber',
   'bidEnd',
   'offerValidity',
@@ -51,6 +52,7 @@ export function SettingsPanel() {
   const [email, setEmail] = useState('')
   const [phone, setPhone] = useState('')
   const [udyamNumber, setUdyamNumber] = useState('')
+  const [logo, setLogo] = useState('')
   const [customFields, setCustomFields] = useState<CompanyField[]>([])
   const [fieldDraft, setFieldDraft] = useState('')
   const [savedCount, setSavedCount] = useState(0)
@@ -76,6 +78,7 @@ export function SettingsPanel() {
       setEmail(next.email)
       setPhone(next.phone)
       setUdyamNumber(next.udyamNumber)
+      setLogo(next.logo)
       setCustomFields(next.fields)
     }
     setDocuments(next.documents)
@@ -107,6 +110,7 @@ export function SettingsPanel() {
         email,
         phone,
         udyamNumber,
+        logo,
         fields: customFields,
       })
       if (ok) {
@@ -121,6 +125,26 @@ export function SettingsPanel() {
     }
   }
 
+  function onLogo(file: File | undefined) {
+    if (!file || busy) return
+    const okType = file.type === 'image/png' || file.type === 'image/jpeg'
+    if (!okType || file.size > 500 * 1024) {
+      setNotice('Use a PNG or JPEG under 500 KB.')
+      return
+    }
+    const reader = new FileReader()
+    reader.onload = () => {
+      const result = typeof reader.result === 'string' ? reader.result : ''
+      if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(result) || result.length > 700_000) {
+        setNotice('Use a PNG or JPEG under 500 KB.')
+        return
+      }
+      setNotice(null)
+      setLogo(result)
+    }
+    reader.readAsDataURL(file)
+  }
+
   function onAddField() {
     const label = fieldDraft.trim()
     if (busy || !label) return
@@ -267,6 +291,23 @@ export function SettingsPanel() {
               Phone number
               <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
             </label>
+            <div className="logo-field">
+              Company logo
+              <span className="custom-field-row">
+                {logo ? <img className="logo-preview" src={logo} alt="Company logo" /> : <span>No logo</span>}
+                <FileButton
+                  label={logo ? 'Replace' : 'Upload'}
+                  accept="image/png,image/jpeg"
+                  disabled={busy}
+                  onFile={onLogo}
+                />
+                {logo ? (
+                  <button type="button" className="btn btn-ghost btn-remove" disabled={busy} onClick={() => setLogo('')}>
+                    Remove
+                  </button>
+                ) : null}
+              </span>
+            </div>
             {customFields.map((field) => (
               <label key={field.key} className="wide">
                 {field.label}
@@ -434,10 +475,12 @@ function FileActions({
 function FileButton({
   label,
   disabled,
+  accept,
   onFile,
 }: {
   label: string
   disabled: boolean
+  accept?: string
   onFile: (file: File | undefined) => void
 }) {
   return (
@@ -445,6 +488,7 @@ function FileButton({
       {label}
       <input
         type="file"
+        accept={accept}
         disabled={disabled}
         onChange={(event) => {
           const file = event.target.files?.[0]
diff --git a/app/src/TemplateDialog.tsx b/app/src/TemplateDialog.tsx
index 717420a..69e6a54 100644
--- a/app/src/TemplateDialog.tsx
+++ b/app/src/TemplateDialog.tsx
@@ -105,6 +105,21 @@ export function TemplateDialog({
     }
   }
 
+  async function onPrint() {
+    const panel = window.panel
+    if (!panel || busy || templateId == null || !ready) return
+    setBusy(true)
+    setNotice(null)
+    try {
+      const result = await panel.printTemplate(templateId, fieldValues())
+      if (result === 'failed') setNotice('Could not print that document.')
+    } catch {
+      setNotice('Could not print that document.')
+    } finally {
+      setBusy(false)
+    }
+  }
+
   async function onDownload() {
     const panel = window.panel
     if (!panel || busy || templateId == null || !ready) return
@@ -219,6 +234,9 @@ export function TemplateDialog({
               <button type="button" className="btn btn-secondary" disabled={busy || !ready} onClick={() => void onPreview()}>
                 Preview
               </button>
+              <button type="button" className="btn btn-secondary" disabled={busy || !ready} onClick={() => void onPrint()}>
+                Print
+              </button>
               <button type="button" className="btn btn-secondary" disabled={busy || !ready} onClick={() => void onDownload()}>
                 Download
               </button>
diff --git a/app/src/app.css b/app/src/app.css
index f7db1c3..d178bcd 100644
--- a/app/src/app.css
+++ b/app/src/app.css
@@ -656,6 +656,17 @@ tbody tr.pending { cursor: default; }
 
 .settings-form .custom-field-row input { flex: 1; }
 
+.logo-field {
+  grid-column: 1 / -1;
+  display: flex;
+  flex-direction: column;
+  gap: 6px;
+  color: #8a8a8a;
+  font-size: 12px;
+}
+
+.logo-preview { height: 48px; width: auto; object-fit: contain; }
+
 .settings-form .custom-field-add {
   grid-column: 1 / -1;
   padding: 0;
diff --git a/app/src/panel.d.ts b/app/src/panel.d.ts
index 85510ff..4424320 100644
--- a/app/src/panel.d.ts
+++ b/app/src/panel.d.ts
@@ -92,6 +92,7 @@ export type CompanyFields = {
   email: string
   phone: string
   udyamNumber: string
+  logo: string
   fields: CompanyField[]
 }
 
@@ -129,6 +130,8 @@ export type TemplatePreview = {
 
 export type TemplateDownload = 'saved' | 'cancelled' | 'failed'
 
+export type TemplatePrint = 'printed' | 'cancelled' | 'failed'
+
 export type MergeSource =
   | { kind: 'company'; name: string }
   | { kind: 'upload'; name: string; data: Uint8Array }
@@ -186,6 +189,7 @@ export type PanelApi = {
   mergeDocument: (bidNumber: string, documentName: string, sources: MergeSource[]) => Promise<MergeResult>
   mergeDownload: (bidNumber: string, documentName: string, sources: MergeSource[]) => Promise<MergeResult>
   downloadTemplate: (id: number, bidNumber: string, values: Record<string, string>) => Promise<TemplateDownload>
+  printTemplate: (id: number, values: Record<string, string>) => Promise<TemplatePrint>
   onRow: (listener: () => void) => () => void
   onFetchDone: (listener: () => void) => () => void
   onFetchProgress: (listener: (event: FetchProgress) => void) => () => void
diff --git a/supabase/schema.sql b/supabase/schema.sql
index fd12a80..202f539 100644
--- a/supabase/schema.sql
+++ b/supabase/schema.sql
@@ -96,6 +96,7 @@ alter table company add column if not exists email text not null default '';
 alter table company add column if not exists phone text not null default '';
 alter table company add column if not exists udyam_number text not null default '';
 alter table company add column if not exists fields jsonb not null default '[]'::jsonb;
+alter table company add column if not exists logo text not null default '';
 
 insert into company (id)
 values (1)
`. Read that file — it is the content under review.

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
