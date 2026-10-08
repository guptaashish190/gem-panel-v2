Read `# Edge Case Hunter Review

**Goal:** You are a pure path tracer. Never comment on whether code is good or bad; only list missing handling.
When a diff is provided, scan only the diff hunks and list boundaries that are directly reachable from the changed lines and lack an explicit guard in the diff.
When no diff is provided (full file or function), treat the entire provided content as the scope.
Ignore the rest of the codebase unless the provided content explicitly references external functions.
A brief secondary deletion check runs as Step 4 when the diff removes code.
A claims check runs as Step 5.

**Inputs:**
- **content** — Content to review, or a path to read it from: diff, full file, or function
- **also_consider** (optional) — Areas to keep in mind during review alongside normal edge-case analysis
- **claims_file** — Path to the spec this change was built from. Do NOT read it before Step 5: the path tracing in Steps 2–3 must finish before the claims are seen.

**MANDATORY: Execute steps in the Execution section IN EXACT ORDER. DO NOT skip steps or change the sequence. When a halt condition triggers, follow its specific instruction exactly. Each action within a step is a REQUIRED action to complete that step.**

**Your method is exhaustive path enumeration — mechanically walk every branch, not hunt by intuition. Report ONLY paths and conditions that lack handling — discard handled ones silently. Do NOT editorialize or add filler. Do not assign severity labels, rankings, or priority levels.**


## EXECUTION

### Step 1: Receive Content

- Take the content to review from the parent message that launched you — inline, or by reading the file it points to (never from this instruction file)
- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
- Identify content type (diff, full file, or function) to determine scope rules

### Step 2: Exhaustive Path Analysis

**Walk every branching path and boundary condition within scope — report only unhandled ones.**

- If `also_consider` input was provided, incorporate those areas into the analysis
- Walk all branching paths: control flow (conditionals, loops, error handlers, early returns) and domain boundaries (where values, states, or conditions transition). Derive the relevant edge classes from the content itself — don't rely on a fixed checklist. Examples: missing else/default, unguarded inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
- Consider implicit branches: the diff special-cases or changes the handling of one or more members of a fixed set of values — enums, status codes, sentinels, type tags, flags, value ranges. The rest of the set is implicit branches (e.g. the diff changes the `RED` and `YELLOW` cases of a `RED`/`YELLOW`/`GREEN` enum; `GREEN` is the implicit branch)
- Consider handle lifetime: when the changed code re-checks, re-fetches, or re-validates something it already held — a handle, index, id, pointer — the re-check exists because an intervening call can invalidate it. Identify that call, what it does to the thing held, and what the changed code silently skips when the re-check fails
- For each call site the diff adds or changes — in test files as well as production code — read the callee's declaration and check the call against it: argument count, order, types, and defaults. Report any mismatch
- For each path: determine whether the content handles it
- Collect only the unhandled paths as findings — discard handled ones silently

### Step 3: Validate Completeness

- Revisit every edge class from Step 2 — e.g., missing else/default, null/empty inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
- Add any newly found unhandled paths to findings; discard confirmed-handled ones

### Step 4: Deletion Check

If the diff removed or replaced meaningful code (ignore pure renames and whitespace): load `references/deletion-check.md` and follow it.

### Step 5: Claims Check

Load `references/claims-check.md` and follow it.

### Step 6: Present Findings

Output all findings as a single JSON array following the Output Format specification exactly.


## OUTPUT FORMAT

Return ONLY a valid JSON array of objects. Each edge-case finding contains exactly these four fields:

```json
[{
  "location": "file:start-end (or file:line when single line, or file:hunk when exact line unavailable)",
  "trigger_condition": "one-line description (max 15 words)",
  "guard_snippet": "minimal code sketch that closes the gap (single-line escaped string, no raw newlines or unescaped quotes)",
  "potential_consequence": "what could actually go wrong (max 15 words)"
}]
```

No extra text, no explanations, no markdown wrapping. An empty array `[]` is valid when nothing is found. Deletion findings from Step 4 and claim findings from Step 5, if any, go in the same array with the extra fields defined in `references/deletion-check.md` and `references/claims-check.md`.


## HALT CONDITIONS

- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
<reference path="references/deletion-check.md">
# Deletion Check

Secondary pass for the Edge Case Hunter — runs only when the diff removed meaningful code. Subordinate to the edge-case pass; findings are usually few or none.

For each chunk of removed or replaced code (ignore pure renames and whitespace), ask: did it carry behavior or a contract that the change neither re-established nor intentionally retired? Add a finding for any resulting regression, orphaned reference, or newly-dead code. Skip anything already covered by your edge-case findings.

Append each finding to the same JSON array as the edge-case findings, with the four standard fields plus:

- `kind`: `"deletion"`
- `confidence`: `"high"`, `"medium"`, or `"low"` — these are inferences; rate them

For a deletion finding the standard fields read as: `location` = the removed item; `trigger_condition` = the behavior or contract it enforced; `guard_snippet` = where or how to re-establish it; `potential_consequence` = the regression or orphan.

Add nothing if nothing qualifies.
</reference>
<reference path="references/claims-check.md">
# Claims Check

Final pass for the Edge Case Hunter. Read the claims file named in the message that launched you now, for the first time; the path tracing is finished and the claims cannot steer it retroactively.

It is the spec the change was built from. Read only its `## Intent` and `## Tasks & Acceptance` sections — the claims live there; ignore the rest of the file. The spec is the change's own account of itself: testimony, not evidence — a claim repeated in a code comment is still the same claim, not confirmation. Extract each checkable claim — what the change does, what it preserves, ordering, arithmetic, and parity with existing code ("exactly as X does") — then try to falsify each one against the code you have already traced. Where your trace is not enough to decide, read the code that decides it: the compared-to function, the actual callee, the state the claim assumes.

Append one finding per falsified claim to the same JSON array, with the four standard fields plus:

- `kind`: `"claim"`
- `confidence`: `"high"`, `"medium"`, or `"low"`

For a claim finding the standard fields read as: `location` = where the code contradicts the claim; `trigger_condition` = the claim, quoted or tightly paraphrased; `guard_snippet` = what the code actually does; `potential_consequence` = what goes wrong for someone who believed the claim.

Verified claims produce nothing. Add nothing if nothing is falsified.
</reference>

## CONTENT SOURCE

"Review content:" in the message that launched you gives the content itself or a path to read it from. Read the file when it is a path; either way that is the content under review, and this instruction file never is.
` completely and follow it as your review instructions.

claims_file (leave unread until your instructions call for it): ---
title: 'Company logo placeholder and template printing'
type: 'feature'
created: '2026-10-09'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 042ee4c7188d824b89f6f7196804c784a1fbaaae
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Letterheads need the company logo, but templates can only hold text values, so users cannot put a logo on generated documents. Users also cannot print a filled template directly from Prepare.

**Approach:** Settings → Company gets a logo upload stored with the company row. Templates use `{{logo}}`, which renders as the image in preview, saved/downloaded documents and print. Prepare gets a Print button that opens the system print dialog for the filled document.

## Boundaries & Constraints

**Always:**
- Logo is PNG or JPEG, at most 500 KB, stored as a `data:image/png|jpeg;base64,...` string in a new `company.logo` text column (default `''`). Saved with the existing Company Save, removable.
- Main validates the logo on save (type prefix, base64 alphabet only, length cap) and refuses the whole save when invalid.
- `{{logo}}` is a built-in placeholder chip (label Company logo), reserved like other built-ins.
- `{{logo}}` renders as `<img>` from the company record loaded in main; never from renderer-sent values. Empty logo renders nothing.
- Settings preview (no bid) leaves `{{logo}}` as text, like other tokens.
- Prepare never shows `logo` as an editable field.
- Print renders the same document as Download (same values), in a hidden window, and opens the native print dialog. Cancel is silent; failure shows a notice.
- If the `logo` column is missing, templates still render (logo empty).

**Never:**
- No change to `.doc` output format or to other placeholders' escaping.
- No logo upload to Storage bucket; no new table.
- No silent printing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upload | 120 KB PNG | Preview shows; Save stores it | N/A |
| Too big / wrong type | 2 MB PNG, or GIF | Not applied | Notice: Use a PNG or JPEG under 500 KB. |
| Render | Template `{{logo}}`, logo set | `<img src="data:image/png;base64,...">` in output | N/A |
| No logo | Logo empty | Token disappears | N/A |
| Forged value | Renderer sends `logo: "<script>"` | Ignored; company logo used | N/A |
| Bad stored logo | Column holds non-data-URL text | Token renders nothing | N/A |
| Print | Click Print in Prepare | System print dialog with filled A4 document | Failure → Could not print that document. |

</frozen-after-approval>

## Code Map

- `supabase/schema.sql` -- add `alter table company add column if not exists logo text not null default '';` after the `fields` alter.
- `app/electron/types.ts`, `app/src/panel.d.ts` -- `CompanyFields` gains `logo: string`; add `TemplatePrint = 'printed' | 'cancelled' | 'failed'`; `PanelApi.printTemplate(id, values)`.
- `app/electron/template.ts` -- add `{ key: 'logo', label: 'Company logo' }` to `PLACEHOLDERS`; export `isLogoData(value)` (regex + length ≤ 700 000). `renderTemplateDocument(body, values, logo?)`: when `logo` is a string, `{{logo}}` → `<img>` if valid else `''`; when undefined, token stays. Escape slot text at push time so the logo slot can hold raw HTML. `templateFields` drops `logo`. `templateValues` does not emit `logo`.
- `app/electron/store.ts` -- `loadCompany` returns `logo` (tolerant: `''` when absent/invalid); `saveCompany` upserts `logo`; new `companyLogo(client)` selects only `logo`, returns `''` on error or invalid.
- `app/electron/main.ts` -- `companyFieldsOf` validates `logo` via `isLogoData` (or `''`). `render-template`, `save-template-document`, `download-template` pass `await store.companyLogo(db)` to `renderTemplateDocument`. New `print-template` handler: render, write to temp `.html`, load in hidden `BrowserWindow` (no preload, `javascript: false`), `webContents.print({}, cb)`, close window and delete temp file.
- `app/electron/preload.cts` -- expose `printTemplate`.
- `app/src/SettingsPanel.tsx` -- add `'logo'` to local `RESERVED_KEYS`; logo row in Company form: preview `<img>`, Upload/Replace (reuse `FileButton`, `accept` png/jpeg), Remove; read via `FileReader.readAsDataURL`; include `logo` in Save.
- `app/src/TemplateDialog.tsx` -- Print button between Preview and Download, same busy/ready rules.
- `app/src/app.css` -- small `.logo-preview` rule only.
- `app/electron/template.test.ts` -- company fixtures gain `logo: ''`.
- Do not touch: `TemplatePreview.tsx` (sandboxed iframe already shows data-URL images), `expandPatternRows` behavior.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/schema.sql` -- add `logo` column -- storage.
- [x] `app/electron/types.ts`, `app/src/panel.d.ts` -- `logo`, `TemplatePrint`, `printTemplate` -- shared shape.
- [x] `app/electron/template.ts` -- placeholder, `isLogoData`, logo rendering, field filter -- render path.
- [x] `app/electron/store.ts` -- load/save `logo`, `companyLogo` -- persistence.
- [x] `app/electron/main.ts`, `app/electron/preload.cts` -- validation, logo into renders, `print-template` -- IPC.
- [x] `app/src/SettingsPanel.tsx`, `app/src/TemplateDialog.tsx`, `app/src/app.css` -- upload UI, Print button -- UI.
- [x] `app/electron/template.test.ts` -- matrix rows: render, empty, forged value, bad stored value, settings preview keeps token, field filtered, `isLogoData` accepts/rejects.

**Acceptance Criteria:**
- Given a saved logo, when the app restarts, then Settings shows the logo preview.
- Given a template with `{{logo}}`, when Save to document or Download runs, then the `.doc` file contains the logo `<img>`.
- Given the Prepare dialog, when the user clicks Print and cancels, then no notice appears and the dialog stays open.

## Implementation Notes

- Slot text is escaped when it is pushed, not when it is filled, so `{{logo}}` can insert a raw `<img>` while every other value still goes through `htmlText`. Existing markup tests still pass.
- Print treats a failure reason matching `/cancel/i` as cancelled, so both "cancelled" and "canceled" stay silent.
- The Settings screen checks file type, the 500 KB limit, and the data-URL shape before showing a preview. Main refuses the whole save when `logo` is not `isLogoData` or empty.

## Spec Change Log

## Review Triage Log

## Design Notes

Logo comes from main, not from Prepare values, so a multi-hundred-KB string never round-trips through IPC fields and a renderer cannot inject HTML through it. Rendered tag: `<img src="DATA" alt="Company logo" height="80" style="height:80px;width:auto">` — the `height` attribute is what Word honours. Template usage: `<p align="center">{{logo}}</p>`.

## Verification

**Commands:**
- `npm test` in `app/` -- expected: all tests pass
- `npm run typecheck` in `app/` -- expected: exit 0

**Manual checks:**
- Run the `schema.sql` alter in Supabase, upload a logo, add `{{logo}}` to a template, Prepare → Preview, Download (open in Word), Print.


Review content: the unified diff at `diff --git a/app/electron/main.ts b/app/electron/main.ts
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

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. If the instruction file is unreadable, report that exact failure and stop. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
