import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { isPdf, mergeError, mergeNamedPdfs, pdfDownloadName } from './merge.js'

async function page(width: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([width, 100])
  return new Uint8Array(await doc.save())
}

test('download name keeps one pdf extension and the bid number', () => {
  assert.equal(pdfDownloadName('Experience Certificate.pdf', 'GEM/2026/B/1'), 'Experience Certificate GEM-2026-B-1.pdf')
  assert.equal(pdfDownloadName('License: copy', 'GEM/1'), 'License- copy GEM-1.pdf')
})

test('isPdf accepts a header within the first kilobyte', () => {
  const bytes = new Uint8Array(12)
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d], 4)
  assert.equal(isPdf(bytes), true)
  assert.equal(isPdf(new TextEncoder().encode('not a pdf')), false)
})

test('merge keeps page order', async () => {
  const result = await mergeNamedPdfs([
    { name: 'wide.pdf', bytes: await page(300) },
    { name: 'narrow.pdf', bytes: await page(120) },
  ])
  assert.equal(result.ok, true)
  if (!result.ok) return
  const doc = await PDFDocument.load(result.bytes)
  assert.equal(doc.getPageCount(), 2)
  assert.equal(doc.getPage(0).getWidth(), 300)
  assert.equal(doc.getPage(1).getWidth(), 120)
})

test('merge rejects a file that is not a pdf before touching later files', async () => {
  const result = await mergeNamedPdfs([
    { name: 'notes.txt', bytes: new TextEncoder().encode('hello') },
    { name: 'page.pdf', bytes: await page(200) },
  ])
  assert.deepEqual(result, { ok: false, message: 'notes.txt is not a PDF.' })
})

test('merge names the file that cannot be read as a pdf', async () => {
  const result = await mergeNamedPdfs([{ name: 'broken.pdf', bytes: new TextEncoder().encode('%PDF-1.7 nope') }])
  assert.deepEqual(result, { ok: false, message: 'broken.pdf could not be merged.' })
})

test('a protected pdf is named in the failure', () => {
  assert.equal(
    mergeError('License', new Error('Input document to `PDFDocument.load` is encrypted.')),
    'License is protected and could not be merged.',
  )
})
