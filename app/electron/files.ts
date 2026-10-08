import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GEM_PDF_NAME } from './types.js'

export const UNSAVED_CAP = 1000

export function bidDirName(bidNumber: string): string {
  return bidNumber.replaceAll('/', '-')
}

export function documentsDir(root: string, bidNumber: string): string {
  return path.join(root, bidDirName(bidNumber), 'documents')
}

export function gemPdfPath(root: string, bidNumber: string): string {
  return path.join(documentsDir(root, bidNumber), 'gem.pdf')
}

export function documentFileName(docName: string): string {
  if (docName === GEM_PDF_NAME) return 'gem.pdf'
  const cleaned = docName.replace(/[\\/]/g, '-').replace(/^\.+/, '').trim()
  return cleaned || 'file'
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export function fileAction(local: boolean, stored: boolean): 'ready' | 'download' | 'upload' {
  if (local) return 'ready'
  if (stored) return 'download'
  return 'upload'
}

export async function readGemPdf(root: string, bidNumber: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(gemPdfPath(root, bidNumber)))
  } catch {
    return null
  }
}

export async function writeGemPdf(root: string, bidNumber: string, bytes: Uint8Array): Promise<void> {
  const dest = gemPdfPath(root, bidNumber)
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, bytes)
}

export async function removeGemPdf(root: string, bidNumber: string): Promise<void> {
  await rm(gemPdfPath(root, bidNumber), { force: true })
}

export async function removeBidDir(root: string, bidNumber: string): Promise<void> {
  await rm(path.join(root, bidDirName(bidNumber)), { recursive: true, force: true })
}

export async function writeDocument(
  root: string,
  bidNumber: string,
  docName: string,
  bytes: Uint8Array,
  extension = '',
): Promise<string> {
  const dir = documentsDir(root, bidNumber)
  await mkdir(dir, { recursive: true })
  const base = documentFileName(docName)
  const filename = extension && !base.endsWith(extension) ? `${base}${extension}` : base
  if (docName !== GEM_PDF_NAME) {
    const names = await readdir(dir).catch(() => [] as string[])
    await Promise.all(
      names
        .filter((name) => name === base || name.startsWith(`${base}.`))
        .map((name) => rm(path.join(dir, name), { force: true })),
    )
  }
  await writeFile(path.join(dir, filename), bytes)
  return filename
}

export async function localDocumentPath(root: string, bidNumber: string, docName: string): Promise<string | null> {
  if (docName === GEM_PDF_NAME) {
    const file = gemPdfPath(root, bidNumber)
    return (await exists(file)) ? file : null
  }
  const dir = documentsDir(root, bidNumber)
  const base = documentFileName(docName)
  const names = await readdir(dir).catch(() => [] as string[])
  const name = names.find((entry) => entry === base || entry.startsWith(`${base}.`))
  return name ? path.join(dir, name) : null
}

export async function documentIsLocal(root: string, bidNumber: string, docName: string): Promise<boolean> {
  return (await localDocumentPath(root, bidNumber, docName)) != null
}

export async function countUnsaved(root: string, savedBidNumbers: readonly string[]): Promise<number> {
  const savedDirs = new Set(savedBidNumbers.map(bidDirName))
  const names = await readdir(root).catch(() => [] as string[])
  let count = 0
  for (const name of names) {
    if (savedDirs.has(name)) continue
    if (await exists(path.join(root, name, 'documents', 'gem.pdf'))) count += 1
  }
  return count
}

export async function applyUnsave(
  root: string,
  bidNumber: string,
  ports: {
    setSaved: (bidNumber: string, saved: boolean) => Promise<void>
    savedBidNumbers: () => Promise<string[]>
  },
): Promise<void> {
  await ports.setSaved(bidNumber, false)
  const saved = await ports.savedBidNumbers()
  const unsaved = await countUnsaved(root, saved)
  if (unsaved > UNSAVED_CAP) await removeGemPdf(root, bidNumber)
}

export function companyDocumentsDir(root: string): string {
  return path.join(root, 'company')
}

function isCompanyFile(entry: string, base: string): boolean {
  if (entry === base) return true
  if (!entry.startsWith(`${base}.`)) return false
  return /^[a-z0-9]{1,8}$/i.test(entry.slice(base.length + 1))
}

export async function writeCompanyDocument(
  root: string,
  docName: string,
  bytes: Uint8Array,
  extension = '',
): Promise<string> {
  const dir = companyDocumentsDir(root)
  await mkdir(dir, { recursive: true })
  const base = documentFileName(docName)
  const filename = extension && !base.toLowerCase().endsWith(extension) ? `${base}${extension}` : base
  const names = await readdir(dir).catch(() => [] as string[])
  await Promise.all(
    names
      .filter((name) => isCompanyFile(name, base))
      .map((name) => rm(path.join(dir, name), { force: true })),
  )
  await writeFile(path.join(dir, filename), bytes)
  return filename
}

export async function localCompanyDocumentPath(root: string, docName: string): Promise<string | null> {
  const dir = companyDocumentsDir(root)
  const base = documentFileName(docName)
  const names = await readdir(dir).catch(() => [] as string[])
  const name = names.find((entry) => isCompanyFile(entry, base))
  return name ? path.join(dir, name) : null
}

export async function removeCompanyDocumentFiles(root: string, docName: string): Promise<void> {
  const dir = companyDocumentsDir(root)
  const base = documentFileName(docName)
  const names = await readdir(dir).catch(() => [] as string[])
  await Promise.all(
    names
      .filter((name) => isCompanyFile(name, base))
      .map((name) => rm(path.join(dir, name), { force: true })),
  )
}

export async function deliverMissingFile(ports: {
  storedKey: string | null
  readStored: (key: string) => Promise<Uint8Array>
  writeLocal: (bytes: Uint8Array) => Promise<void>
  downloadFromGem: (listingId: string) => Promise<Uint8Array>
}): Promise<boolean> {
  if (!ports.storedKey) return false
  try {
    const bytes = await ports.readStored(ports.storedKey)
    await ports.writeLocal(bytes)
    return true
  } catch {
    return false
  }
}
