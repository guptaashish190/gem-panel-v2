import { marked } from 'marked'
import type { CompanyField, CompanyFields, TemplateField, TemplatePlaceholder } from './types.js'

export const PLACEHOLDERS: TemplatePlaceholder[] = [
  { key: 'companyName', label: 'Company name' },
  { key: 'signatory', label: 'Authorized signatory' },
  { key: 'address', label: 'Address' },
  { key: 'drugLicenseNumber', label: 'Drug license number' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone number' },
  { key: 'udyamNumber', label: 'Udyam certificate number' },
  { key: 'logo', label: 'Company logo' },
  { key: 'bidNumber', label: 'Bid number' },
  { key: 'bidEnd', label: 'Bid end' },
  { key: 'offerValidity', label: 'Offer validity' },
  { key: 'ministryOrState', label: 'Ministry or state' },
  { key: 'department', label: 'Department' },
  { key: 'beneficiaryName', label: 'Beneficiary name' },
]

const labels = new Map<string, string>([
  ...PLACEHOLDERS.map((item) => [item.key, item.label] as const),
  ['buyerEmail', 'Buyer email'],
  ['hodEmail', 'HOD email'],
  ['evaluationMethod', 'Evaluation method'],
  ['emdAmount', 'EMD amount'],
  ['products', 'Products'],
  ['productRows', 'Products'],
])

export type TemplateTender = {
  bidNumber: string
  bidEnd: string | null
  offerValidity: string | null
  ministryOrState: string | null
  department: string | null
  buyerEmail: string | null
  hodEmail: string | null
  evaluationMethod: string | null
  beneficiaryName: string | null
  emdAmount: number | null
  products: { name: string; quantity: number | null }[]
}

const TENDER_KEYS: (keyof TemplateTender)[] = [
  'bidNumber',
  'bidEnd',
  'offerValidity',
  'ministryOrState',
  'department',
  'buyerEmail',
  'hodEmail',
  'evaluationMethod',
  'beneficiaryName',
  'emdAmount',
  'products',
]

export const RESERVED_KEYS: string[] = [
  ...new Set([...PLACEHOLDERS.map((item) => item.key), ...TENDER_KEYS, 'products', 'productRows', 'product']),
]

const LOGO_LIMIT = 700_000

export function isLogoData(value: string): boolean {
  if (value.length === 0 || value.length > LOGO_LIMIT) return false
  return /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
}

export function isReservedKey(key: string): boolean {
  const lower = key.toLowerCase()
  return RESERVED_KEYS.some((item) => item.toLowerCase() === lower)
}

export function fieldKey(label: string): string {
  const words = label.match(/[A-Za-z0-9]+/g) ?? []
  const key = words
    .map((word, index) => {
      const lower = word.toLowerCase()
      return index === 0 ? lower : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
    })
    .join('')
  if (!key) return ''
  return /^[0-9]/.test(key) ? `field${key}` : key
}

export function customFieldsOf(value: unknown): CompanyField[] | null {
  if (!Array.isArray(value)) return null
  const result: CompanyField[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    if (typeof row.key !== 'string' || typeof row.label !== 'string' || typeof row.value !== 'string') return null
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(row.key) || isReservedKey(row.key)) return null
    if (!row.label.trim()) return null
    const lower = row.key.toLowerCase()
    if (seen.has(lower)) return null
    seen.add(lower)
    result.push({ key: row.key, label: row.label.trim(), value: row.value.trim() })
  }
  return result
}

export function placeholdersFor(fields: CompanyField[]): TemplatePlaceholder[] {
  return [...PLACEHOLDERS, ...fields.map((field) => ({ key: field.key, label: field.label }))]
}

export function companyFieldLabels(fields: CompanyField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, field.label]))
}

function tokenPattern(): RegExp {
  return /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g
}

export function templateTokens(body: string): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const match of body.matchAll(tokenPattern())) {
    const key = match[1]
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(tokenPattern(), (raw, key: string) => (Object.hasOwn(values, key) ? values[key] : raw))
}

export const productStarterTable = `| Product name | Qty | Offer price | MRP | OEM |
| --- | --- | --- | --- | --- |
| {{product.name}} | {{product.quantity}} | {{product.offerPrice}} | {{product.mrp}} | {{product.oem}} |`

type ProductColumn = { key: string; label: string }
type ProductRows = { columns: ProductColumn[]; rows: Record<string, string>[] }

function productTokenPattern(): RegExp {
  return /\{\{\s*product\.([A-Za-z0-9]+)\s*\}\}/g
}

function lineCells(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return null
  const parts = trimmed.split('|')
  parts.shift()
  if (trimmed.endsWith('|')) parts.pop()
  return parts.map((cell) => cell.trim())
}

function isSeparatorLine(line: string): boolean {
  const cells = lineCells(line)
  if (!cells || cells.length === 0) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function patternTables(body: string): { lineIndex: number; header: string[]; bodyCells: string[] }[] {
  const lines = body.split(/\r?\n/)
  const tables: { lineIndex: number; header: string[]; bodyCells: string[] }[] = []
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!isSeparatorLine(lines[index] ?? '')) continue
    const bodyLine = lines[index + 1]
    if (bodyLine == null || !/\{\{\s*product\.[A-Za-z0-9]+\s*\}\}/.test(bodyLine)) continue
    const bodyCells = lineCells(bodyLine)
    if (!bodyCells) continue
    const header = index > 0 ? (lineCells(lines[index - 1] ?? '') ?? []) : []
    tables.push({ lineIndex: index + 1, header, bodyCells })
  }
  return tables
}

function patternColumns(body: string): ProductColumn[] {
  const columns: ProductColumn[] = []
  const seen = new Set<string>()
  for (const table of patternTables(body)) {
    table.bodyCells.forEach((cell, index) => {
      for (const match of cell.matchAll(productTokenPattern())) {
        const key = match[1]
        if (!key || seen.has(key)) continue
        seen.add(key)
        columns.push({ key, label: table.header[index] ?? key })
      }
    })
  }
  return columns
}

function parseProductRows(raw: string | undefined): ProductRows | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if (!Array.isArray(record.columns) || !Array.isArray(record.rows)) return null
  const columns: ProductColumn[] = []
  for (const column of record.columns) {
    if (!column || typeof column !== 'object' || Array.isArray(column)) return null
    const item = column as Record<string, unknown>
    if (typeof item.key !== 'string' || typeof item.label !== 'string') return null
    if (!/^[A-Za-z0-9]+$/.test(item.key)) return null
    columns.push({ key: item.key, label: item.label })
  }
  const rows: Record<string, string>[] = []
  for (const row of record.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null
    const cells: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      if (typeof value !== 'string') return null
      cells[key] = value
    }
    rows.push(cells)
  }
  return { columns, rows }
}

function productRowsValue(products: { name: string; quantity: number | null }[]): string {
  return JSON.stringify({
    columns: [],
    rows: products.map((product) => ({
      name: product.name,
      quantity: product.quantity == null ? '' : String(product.quantity),
    })),
  })
}

function expandPatternRows(body: string, rows: Record<string, string>[] | null, slots: string[]): string {
  if (rows == null) return body
  const tables = patternTables(body)
  if (tables.length === 0) return body
  const byLine = new Map(tables.map((table) => [table.lineIndex, table]))
  const lines = body.split(/\r?\n/)
  const next: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const table = byLine.get(index)
    const line = lines[index]
    if (!table || line == null) {
      if (line != null) next.push(line)
      continue
    }
    for (const row of rows) {
      const cells = table.bodyCells.map((cell) =>
        cell.replace(productTokenPattern(), (_raw, key: string) => {
          const id = slots.length
          slots.push(htmlText(row[key] ?? ''))
          return `\uE000${id}\uE001`
        }),
      )
      next.push(`| ${cells.join(' | ')} |`)
    }
  }
  return next.join('\n')
}

export function productsLine(products: { name: string; quantity: number | null }[]): string {
  return products
    .map((product) => {
      const name = product.name.trim()
      if (!name) return ''
      if (product.quantity == null) return name
      return `${name} ${product.quantity}`
    })
    .filter(Boolean)
    .join('; ')
}

export function companyValues(company: CompanyFields): Record<string, string> {
  const custom: Record<string, string> = {}
  for (const field of company.fields) custom[field.key] = field.value
  return {
    ...custom,
    companyName: company.name,
    signatory: company.signatory,
    address: company.address,
    drugLicenseNumber: company.drugLicenseNumber,
    gstin: company.gstin,
    email: company.email,
    phone: company.phone,
    udyamNumber: company.udyamNumber,
  }
}

export function templateValues(company: CompanyFields, tender: TemplateTender): Record<string, string> {
  return {
    ...companyValues(company),
    bidNumber: tender.bidNumber,
    bidEnd: tender.bidEnd ?? '',
    offerValidity: tender.offerValidity ?? '',
    ministryOrState: tender.ministryOrState ?? '',
    department: tender.department ?? '',
    buyerEmail: tender.buyerEmail ?? '',
    hodEmail: tender.hodEmail ?? '',
    evaluationMethod: tender.evaluationMethod ?? '',
    beneficiaryName: tender.beneficiaryName ?? '',
    emdAmount: tender.emdAmount == null ? '' : String(tender.emdAmount),
    products: productsLine(tender.products),
    productRows: productRowsValue(tender.products),
  }
}

export function templateFields(
  body: string,
  values: Record<string, string>,
  customLabels: Record<string, string> = {},
): TemplateField[] {
  const columns = patternColumns(body)
  const fields = templateTokens(body)
    .filter((key) => key !== 'logo' && (columns.length === 0 || key !== 'productRows'))
    .map((key) => ({
      key,
      label: labels.get(key) ?? (Object.hasOwn(customLabels, key) ? customLabels[key] : key),
      value: values[key] ?? '',
    }))
  if (columns.length === 0) return fields
  const source = parseProductRows(values.productRows)
  const rows = (source?.rows ?? []).map((row) => {
    const next: Record<string, string> = {}
    for (const column of columns) {
      next[column.key] = column.key === 'name' || column.key === 'quantity' ? (row[column.key] ?? '') : ''
    }
    return next
  })
  fields.push({
    key: 'productRows',
    label: labels.get('productRows') ?? 'Products',
    value: JSON.stringify({ columns, rows }),
  })
  return fields
}

function logoImage(logo: string): string {
  if (!isLogoData(logo)) return ''
  return `<img src="${logo}" alt="Company logo" height="80" style="height:80px;width:auto">`
}

export function renderTemplateDocument(body: string, values: Record<string, string>, logo?: string): string {
  const slots: string[] = []
  const parsedRows = Object.hasOwn(values, 'productRows') ? parseProductRows(values.productRows) : null
  const expanded = expandPatternRows(body, parsedRows ? parsedRows.rows : null, slots)
  const source = expanded.replace(tokenPattern(), (raw, key: string) => {
    if (key === 'logo') {
      if (typeof logo !== 'string') return raw
      const id = slots.length
      slots.push(logoImage(logo))
      return `\uE000${id}\uE001`
    }
    if (!Object.hasOwn(values, key)) return raw
    const id = slots.length
    slots.push(htmlText(values[key]))
    return `\uE000${id}\uE001`
  })
  const html = marked(source, { async: false, gfm: true, breaks: true })
  const filled = html.replace(/\uE000(\d+)\uE001/g, (_raw, index: string) => slots[Number(index)] ?? '')
  return wordDocument(filled.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))
}

function htmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\r|\n/g, '<br>')
}

function wordDocument(body: string): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<style>
@page { size: A4; margin: 2cm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 11.5pt; line-height: 1.45; color: #000000; }
h1 { font-size: 18pt; font-weight: bold; color: #1e3a5f; text-align: center; margin: 0 0 2pt; }
h2 { font-size: 12.5pt; font-weight: bold; color: #000000; margin: 12pt 0 4pt; }
h3 { font-size: 12pt; font-weight: bold; color: #000000; margin: 10pt 0 4pt; }
h4, h5, h6 { font-size: 11.5pt; font-weight: bold; color: #000000; margin: 8pt 0 4pt; }
h1 + p { text-align: center; font-size: 9.5pt; color: #333333; margin: 0 0 4pt; }
p { margin: 0 0 9pt; }
strong { color: #000000; }
a { color: #1d4ed8; }
hr { border: none; border-top: 1.5px solid #1e3a5f; margin: 4pt 0 12pt; }
ul, ol { margin: 0 0 9pt 18pt; padding: 0; }
li { margin-bottom: 6pt; }
blockquote { margin: 8pt 0; padding: 6pt 12pt; border-left: 3px solid #1e3a5f; background: #f1f5f9; color: #333333; }
code { font-family: Consolas, "Courier New", monospace; font-size: 10pt; background: #f1f5f9; }
table { width: 100%; border-collapse: collapse; margin: 14pt 0; font-size: 9.5pt; }
thead { display: table-header-group; }
th { background: #1e3a5f; color: #ffffff; font-weight: bold; text-align: left; border: 1px solid #555555; padding: 4pt 6pt; vertical-align: middle; }
td { border: 1px solid #555555; padding: 3pt 6pt; vertical-align: middle; }
@media screen {
  html { background: #e5e7eb; }
  body { box-sizing: border-box; width: 21cm; min-height: 29.7cm; margin: 24px auto; padding: 2cm; background: #ffffff repeating-linear-gradient(to bottom, transparent 0, transparent calc(29.7cm - 1px), #9ca3af calc(29.7cm - 1px), #9ca3af 29.7cm); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18); }
}
</style>
</head>
<body>
${body}
</body>
</html>`
}
