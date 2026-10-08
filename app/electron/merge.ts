import { PDFDocument } from 'pdf-lib'

export function isPdf(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024)
  for (let index = 0; index <= limit - 5; index += 1) {
    if (
      bytes[index] === 0x25 &&
      bytes[index + 1] === 0x50 &&
      bytes[index + 2] === 0x44 &&
      bytes[index + 3] === 0x46 &&
      bytes[index + 4] === 0x2d
    ) {
      return true
    }
  }
  return false
}

export function mergeError(name: string, error: unknown): string {
  const text = error instanceof Error ? error.message : ''
  if (/encrypt/i.test(text)) return `${name} is protected and could not be merged.`
  return `${name} could not be merged.`
}

async function appendPdf(merged: PDFDocument, bytes: Uint8Array): Promise<void> {
  const source = await PDFDocument.load(bytes)
  const pages = await merged.copyPages(source, source.getPageIndices())
  for (const page of pages) merged.addPage(page)
}

export async function mergeNamedPdfs(
  parts: { name: string; bytes: Uint8Array }[],
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; message: string }> {
  const merged = await PDFDocument.create()
  for (const part of parts) {
    if (!isPdf(part.bytes)) return { ok: false, message: `${part.name} is not a PDF.` }
    try {
      await appendPdf(merged, part.bytes)
    } catch (error) {
      return { ok: false, message: mergeError(part.name, error) }
    }
  }
  return { ok: true, bytes: new Uint8Array(await merged.save()) }
}
